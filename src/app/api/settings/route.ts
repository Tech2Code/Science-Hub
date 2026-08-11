import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { validateSettingsInput } from "@/lib/validation";
import { deriveDefaultPrefix, getIndianFinancialYear, formatFinancialYearLabel, NUMBER_FORMATS, numberFormatDbFilter, findMaxSequence, resolveNumberFormat } from "@/lib/documentNumbering";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { gmailAppPassword, gmailAppPasswordDecryptFailed, gmailUser, ...settings } = await getBusinessSettings();
    // Non-admins (e.g. staff viewing/printing an invoice, which needs the
    // letterhead fields below) must not see the Gmail send-from address —
    // only admins, who manage it on the Settings page, get it back.
    const isAdmin = auth.session.user.role === "admin";
    return NextResponse.json({
      ...settings,
      ...(isAdmin ? { gmailUser, gmailAppPasswordSet: Boolean(gmailAppPassword), gmailAppPasswordDecryptFailed } : {}),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// Each field group below is written only when the request body actually
// contains one of its keys — the settings page saves each section (identity,
// address, bank, email, terms, ...) independently and only ever sends that
// section's own fields, so a save must never touch, validate, or clobber a
// section it isn't editing. This is what stops a broken/undecryptable value
// in one section (e.g. a bank account number that can't be decrypted because
// NEXTAUTH_SECRET doesn't match) from blocking saves anywhere else.
const SIMPLE_STRING_KEYS = ["name", "tagline", "email", "phone", "address", "city", "state", "pincode", "gstin", "termsAndConditions"] as const;
const BANK_KEYS = ["bankName", "bankAccountName", "bankAccountNumber", "bankIfsc", "bankBranch"] as const;
const ADDRESS_KEYS = ["address", "city", "state", "pincode"] as const;
const NUMBERING_KEYS = [
  "invoiceNumberPrefix", "nextInvoiceNumberOverride", "purchaseBillNumberPrefix", "nextPurchaseBillNumberOverride",
  "invoiceNumberFormat", "purchaseBillNumberFormat",
  "creditNoteNumberPrefix", "nextCreditNoteNumberOverride", "creditNoteNumberFormat",
] as const;

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const {
      name, tagline, email, phone, address, city, state, pincode, gstin, pan, gmailUser, gmailAppPassword,
      bankName, bankAccountName, bankAccountNumber, bankIfsc, bankBranch, termsAndConditions, logoUrl, showLogoOnInvoices, expectedUpdatedAt,
      invoiceNumberPrefix, nextInvoiceNumberOverride, purchaseBillNumberPrefix, nextPurchaseBillNumberOverride,
      invoiceNumberFormat, purchaseBillNumberFormat,
      creditNoteNumberPrefix, nextCreditNoteNumberOverride, creditNoteNumberFormat,
    } = body;
    const fieldValues: Record<string, string | undefined> = {
      name, tagline, email, phone, address, city, state, pincode, gstin, termsAndConditions,
      bankName, bankAccountName, bankAccountNumber, bankIfsc, bankBranch,
    };
    const isBankSectionUpdate = BANK_KEYS.some((k) => k in body);
    const isAddressSectionUpdate = ADDRESS_KEYS.some((k) => k in body);

    const validationError = validateSettingsInput(
      { pan, termsAndConditions, phone, address, city, state, pincode, gstin, bankName, bankAccountNumber, bankIfsc, bankBranch },
      isBankSectionUpdate,
      isAddressSectionUpdate,
    );
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await prisma.businessSettings.findUnique({
      where: { id: "singleton" },
      select: {
        updatedAt: true, name: true,
        invoiceNumberPrefix: true, purchaseBillNumberPrefix: true, creditNoteNumberPrefix: true,
        invoiceNumberFormat: true, purchaseBillNumberFormat: true, creditNoteNumberFormat: true,
      },
    });
    if (existing && expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "Business settings were updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const updateData: Record<string, string | boolean | number | null> = {};
    for (const key of SIMPLE_STRING_KEYS) {
      if (key in body) updateData[key] = fieldValues[key] ?? "";
    }
    if ("pan" in body) updateData.pan = (pan ?? "").toUpperCase();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl ?? "";
    if (showLogoOnInvoices !== undefined) updateData.showLogoOnInvoices = Boolean(showLogoOnInvoices);
    if ("gmailUser" in body) {
      updateData.gmailUser = gmailUser ?? "";
      // Save password when explicitly provided; if gmailUser is being cleared, clear password too
      if (gmailAppPassword) updateData.gmailAppPassword = encrypt(gmailAppPassword);
      else if (!gmailUser) updateData.gmailAppPassword = "";
    }
    if (isBankSectionUpdate) {
      for (const key of BANK_KEYS) {
        if (key === "bankAccountNumber") continue;
        updateData[key] = fieldValues[key] ?? "";
      }
      updateData.bankAccountNumber = bankAccountNumber ? encrypt(bankAccountNumber) : "";
    }

    // Document numbering (invoice/purchase-bill prefix + one-time "next
    // number" override) — each field is independently optional, and an
    // empty/blank value clears back to the auto-derived default rather than
    // being rejected, mirroring how the rest of this route treats "not set".
    const isNumberingSectionUpdate = NUMBERING_KEYS.some((k) => k in body);
    const numberingActivityDetails: string[] = [];
    if (isNumberingSectionUpdate) {
      // Must match the same financial-year boundary/label /api/invoices and
      // /api/purchase-bills use to generate numbers, or this validation
      // would check the override against the wrong year's highest number.
      const currentYearLabel = formatFinancialYearLabel(getIndianFinancialYear(new Date()));

      if ("invoiceNumberPrefix" in body) {
        const raw = String(invoiceNumberPrefix ?? "").trim();
        if (raw) {
          if (!/^[A-Z0-9]{2,6}$/i.test(raw)) {
            return NextResponse.json({ error: "Invoice prefix must be 2-6 letters/numbers (e.g. SH)." }, { status: 400 });
          }
          updateData.invoiceNumberPrefix = raw.toUpperCase();
        } else {
          updateData.invoiceNumberPrefix = null;
        }
        numberingActivityDetails.push(`invoice prefix -> ${updateData.invoiceNumberPrefix ?? "(auto)"}`);
      }

      if ("purchaseBillNumberPrefix" in body) {
        const raw = String(purchaseBillNumberPrefix ?? "").trim();
        if (raw) {
          if (!/^[A-Z0-9]{2,6}$/i.test(raw)) {
            return NextResponse.json({ error: "Purchase bill prefix must be 2-6 letters/numbers (e.g. PB)." }, { status: 400 });
          }
          updateData.purchaseBillNumberPrefix = raw.toUpperCase();
        } else {
          updateData.purchaseBillNumberPrefix = null;
        }
        numberingActivityDetails.push(`purchase bill prefix -> ${updateData.purchaseBillNumberPrefix ?? "(auto)"}`);
      }

      if ("creditNoteNumberPrefix" in body) {
        const raw = String(creditNoteNumberPrefix ?? "").trim();
        if (raw) {
          if (!/^[A-Z0-9]{2,6}$/i.test(raw)) {
            return NextResponse.json({ error: "Credit note prefix must be 2-6 letters/numbers (e.g. CN)." }, { status: 400 });
          }
          updateData.creditNoteNumberPrefix = raw.toUpperCase();
        } else {
          updateData.creditNoteNumberPrefix = null;
        }
        numberingActivityDetails.push(`credit note prefix -> ${updateData.creditNoteNumberPrefix ?? "(auto)"}`);
      }

      if ("invoiceNumberFormat" in body) {
        const raw = String(invoiceNumberFormat ?? "").trim();
        if (raw) {
          if (!(raw in NUMBER_FORMATS)) {
            return NextResponse.json({ error: "Unknown invoice number format." }, { status: 400 });
          }
          updateData.invoiceNumberFormat = raw;
        } else {
          updateData.invoiceNumberFormat = null;
        }
        numberingActivityDetails.push(`invoice number format -> ${updateData.invoiceNumberFormat ?? "(default)"}`);
      }

      if ("purchaseBillNumberFormat" in body) {
        const raw = String(purchaseBillNumberFormat ?? "").trim();
        if (raw) {
          if (!(raw in NUMBER_FORMATS)) {
            return NextResponse.json({ error: "Unknown purchase bill number format." }, { status: 400 });
          }
          updateData.purchaseBillNumberFormat = raw;
        } else {
          updateData.purchaseBillNumberFormat = null;
        }
        numberingActivityDetails.push(`purchase bill number format -> ${updateData.purchaseBillNumberFormat ?? "(default)"}`);
      }

      if ("creditNoteNumberFormat" in body) {
        const raw = String(creditNoteNumberFormat ?? "").trim();
        if (raw) {
          if (!(raw in NUMBER_FORMATS)) {
            return NextResponse.json({ error: "Unknown credit note number format." }, { status: 400 });
          }
          updateData.creditNoteNumberFormat = raw;
        } else {
          updateData.creditNoteNumberFormat = null;
        }
        numberingActivityDetails.push(`credit note number format -> ${updateData.creditNoteNumberFormat ?? "(default)"}`);
      }

      if ("nextInvoiceNumberOverride" in body) {
        if (nextInvoiceNumberOverride === null || nextInvoiceNumberOverride === "" || nextInvoiceNumberOverride === undefined) {
          updateData.nextInvoiceNumberOverride = null;
        } else {
          const n = parseInt(String(nextInvoiceNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next invoice number must be a whole number greater than 0." }, { status: 400 });
          }
          const effectivePrefix =
            ("invoiceNumberPrefix" in body ? (updateData.invoiceNumberPrefix as string | null) : existing?.invoiceNumberPrefix)
            || deriveDefaultPrefix(existing?.name || "Science Hub");
          const effectiveFormat = "invoiceNumberFormat" in body ? (updateData.invoiceNumberFormat as string | null) : existing?.invoiceNumberFormat;
          const candidatesThisYear = await prisma.invoice.findMany({
            where: { invoiceNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
            select: { invoiceNumber: true },
          });
          const lastSeq = findMaxSequence(candidatesThisYear.map((c) => c.invoiceNumber), resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel));
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next invoice number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextInvoiceNumberOverride = n;
        }
        numberingActivityDetails.push(`next invoice # -> ${updateData.nextInvoiceNumberOverride ?? "(cleared)"}`);
      }

      if ("nextPurchaseBillNumberOverride" in body) {
        if (nextPurchaseBillNumberOverride === null || nextPurchaseBillNumberOverride === "" || nextPurchaseBillNumberOverride === undefined) {
          updateData.nextPurchaseBillNumberOverride = null;
        } else {
          const n = parseInt(String(nextPurchaseBillNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next purchase bill number must be a whole number greater than 0." }, { status: 400 });
          }
          const effectivePrefix =
            ("purchaseBillNumberPrefix" in body ? (updateData.purchaseBillNumberPrefix as string | null) : existing?.purchaseBillNumberPrefix)
            || "PB";
          const effectiveFormat = "purchaseBillNumberFormat" in body ? (updateData.purchaseBillNumberFormat as string | null) : existing?.purchaseBillNumberFormat;
          const candidatesThisYear = await prisma.purchaseBill.findMany({
            where: { billNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
            select: { billNumber: true },
          });
          const lastSeq = findMaxSequence(candidatesThisYear.map((c) => c.billNumber), resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel));
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next purchase bill number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextPurchaseBillNumberOverride = n;
        }
        numberingActivityDetails.push(`next purchase bill # -> ${updateData.nextPurchaseBillNumberOverride ?? "(cleared)"}`);
      }

      if ("nextCreditNoteNumberOverride" in body) {
        if (nextCreditNoteNumberOverride === null || nextCreditNoteNumberOverride === "" || nextCreditNoteNumberOverride === undefined) {
          updateData.nextCreditNoteNumberOverride = null;
        } else {
          const n = parseInt(String(nextCreditNoteNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next credit note number must be a whole number greater than 0." }, { status: 400 });
          }
          const effectivePrefix =
            ("creditNoteNumberPrefix" in body ? (updateData.creditNoteNumberPrefix as string | null) : existing?.creditNoteNumberPrefix)
            || "CN";
          const effectiveFormat = "creditNoteNumberFormat" in body ? (updateData.creditNoteNumberFormat as string | null) : existing?.creditNoteNumberFormat;
          const candidatesThisYear = await prisma.return.findMany({
            where: { creditNoteNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
            select: { creditNoteNumber: true },
          });
          const lastSeq = findMaxSequence(
            candidatesThisYear.map((c) => c.creditNoteNumber).filter((v): v is string => v !== null),
            resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel)
          );
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next credit note number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextCreditNoteNumberOverride = n;
        }
        numberingActivityDetails.push(`next credit note # -> ${updateData.nextCreditNoteNumberOverride ?? "(cleared)"}`);
      }
    }

    const { gmailAppPassword: storedPassword, bankAccountNumber: storedAccountNumber, ...settings } = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...updateData },
      update: updateData,
    });
    if (numberingActivityDetails.length > 0) {
      await logActivity(auth.session.user.id, "update_numbering_settings", `Updated document numbering: ${numberingActivityDetails.join(", ")}`);
    }
    const decryptedAccountNumber = storedAccountNumber ? safeDecrypt(storedAccountNumber) : { value: "", failed: false };
    return NextResponse.json({
      ...settings,
      gmailAppPasswordSet: Boolean(storedPassword),
      bankAccountNumber: decryptedAccountNumber.value,
      bankAccountNumberDecryptFailed: decryptedAccountNumber.failed,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
