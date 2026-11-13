import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { validateSettingsInput, validateLicensesInput, normalizeBusinessLicenses, type BusinessLicense } from "@/lib/validation";
import { deriveDefaultPrefix, getIndianFinancialYear, formatFinancialYearLabel, NUMBER_FORMATS, numberFormatDbFilter, findMaxSequence, resolveNumberFormat } from "@/lib/documentNumbering";
import { logActivity } from "@/lib/activity";
import { isLogoBlobUrl, deleteAttachmentBlob } from "@/lib/blobStorage";
import { revalidateTag } from "next/cache";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { gmailAppPassword, gmailAppPasswordDecryptFailed, gmailUser, ...settings } = await getBusinessSettings();
    // Non-admins need the letterhead fields (for printing) but must not see the Gmail send-from address.
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

// Each field group is written only when the body contains one of its keys — Settings saves each section independently, so a save must never clobber a section it isn't editing.
const SIMPLE_STRING_KEYS = ["name", "tagline", "email", "phone", "address", "city", "state", "pincode", "gstin", "termsAndConditions"] as const;
const BANK_KEYS = ["bankName", "bankAccountName", "bankAccountNumber", "bankIfsc", "bankBranch"] as const;
const ADDRESS_KEYS = ["address", "city", "state", "pincode"] as const;
const NUMBERING_KEYS = [
  "invoiceNumberPrefix", "nextInvoiceNumberOverride", "purchaseBillNumberPrefix", "nextPurchaseBillNumberOverride",
  "invoiceNumberFormat", "purchaseBillNumberFormat",
  "creditNoteNumberPrefix", "nextCreditNoteNumberOverride", "creditNoteNumberFormat",
] as const;

// Human-readable section/field names for the update_settings ActivityLog entry. Only names are
// ever logged — never values (bank account number, Gmail address/app password are sensitive).
const SETTINGS_FIELD_LABELS: Record<string, { section: string; label: string }> = {
  name: { section: "Business identity", label: "Business name" },
  tagline: { section: "Business identity", label: "Tagline" },
  email: { section: "Business identity", label: "Email" },
  phone: { section: "Business identity", label: "Phone" },
  gstin: { section: "Business identity", label: "GSTIN" },
  pan: { section: "Business identity", label: "PAN" },
  address: { section: "Address", label: "Street address" },
  city: { section: "Address", label: "City" },
  state: { section: "Address", label: "State" },
  pincode: { section: "Address", label: "Pincode" },
  bankName: { section: "Bank details", label: "Bank name" },
  bankAccountName: { section: "Bank details", label: "Account holder name" },
  bankAccountNumber: { section: "Bank details", label: "Account number" },
  bankIfsc: { section: "Bank details", label: "IFSC" },
  bankBranch: { section: "Bank details", label: "Branch" },
  termsAndConditions: { section: "Terms & conditions", label: "Terms & conditions" },
  gmailUser: { section: "Gmail sending account", label: "Gmail address" },
  gmailAppPassword: { section: "Gmail sending account", label: "App password" },
  showLogoOnInvoices: { section: "Logo", label: "Show logo on documents" },
  licenses: { section: "Business licenses", label: "Business licenses" },
};

// null/undefined/"" are all "empty" in this table — a null column vs. a "" write is not a change.
function sameSettingValue(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const {
      name, tagline, email, phone, address, city, state, pincode, gstin, pan, licenses, gmailUser, gmailAppPassword,
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
      { name, tagline, email, gmailUser, pan, termsAndConditions, phone, address, city, state, pincode, gstin, bankName, bankAccountName, bankAccountNumber, bankIfsc, bankBranch },
      isBankSectionUpdate,
      isAddressSectionUpdate,
    );
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // Full row: needed both for the concurrency/numbering checks below and to work out which
    // fields actually changed for the ActivityLog entry.
    const existing = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
    const existingValues = (existing ?? {}) as Record<string, unknown>;
    if (existing && expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "Business settings were updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const updateData: Record<string, string | boolean | number | null | Date> = {};
    for (const key of SIMPLE_STRING_KEYS) {
      if (key in body) updateData[key] = fieldValues[key] ?? "";
    }
    if ("pan" in body) updateData.pan = (pan ?? "").toUpperCase();
    let validatedLicenses: BusinessLicense[] | undefined;
    if ("licenses" in body) {
      const licCheck = validateLicensesInput(licenses);
      if (licCheck.error) return NextResponse.json({ error: licCheck.error }, { status: 400 });
      validatedLicenses = licCheck.licenses;
      updateData.updatedAt = new Date();
    }
    // Only a real upload from /api/settings/logo (or clearing to "") is accepted — an arbitrary URL would become the authoritative logo shown app-wide.
    if (logoUrl !== undefined) {
      if (logoUrl && !isLogoBlobUrl(logoUrl)) {
        return NextResponse.json({ error: "Invalid logo URL." }, { status: 400 });
      }
      updateData.logoUrl = logoUrl || "";
    }
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

    // Each numbering field is independently optional; an empty value clears back to the auto-derived default rather than being rejected.
    const isNumberingSectionUpdate = NUMBERING_KEYS.some((k) => k in body);
    const numberingActivityDetails: string[] = [];
    // Only record a numbering field in the activity log when its value actually changes.
    const pushNumberingDetail = (key: string, text: string) => {
      if (!sameSettingValue(existingValues[key], updateData[key])) numberingActivityDetails.push(text);
    };
    if (isNumberingSectionUpdate) {
      // Must match the same FY boundary/label the invoice/bill routes use, or this validation checks against the wrong year's highest number.
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
        pushNumberingDetail("invoiceNumberPrefix", `invoice prefix -> ${updateData.invoiceNumberPrefix ?? "(auto)"}`);
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
        pushNumberingDetail("purchaseBillNumberPrefix", `purchase bill prefix -> ${updateData.purchaseBillNumberPrefix ?? "(auto)"}`);
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
        pushNumberingDetail("creditNoteNumberPrefix", `credit note prefix -> ${updateData.creditNoteNumberPrefix ?? "(auto)"}`);
      }

      if ("invoiceNumberFormat" in body) {
        const raw = String(invoiceNumberFormat ?? "").trim();
        if (raw) {
          if (!Object.hasOwn(NUMBER_FORMATS, raw)) {
            return NextResponse.json({ error: "Unknown invoice number format." }, { status: 400 });
          }
          updateData.invoiceNumberFormat = raw;
        } else {
          updateData.invoiceNumberFormat = null;
        }
        pushNumberingDetail("invoiceNumberFormat", `invoice number format -> ${updateData.invoiceNumberFormat ?? "(default)"}`);
      }

      if ("purchaseBillNumberFormat" in body) {
        const raw = String(purchaseBillNumberFormat ?? "").trim();
        if (raw) {
          if (!Object.hasOwn(NUMBER_FORMATS, raw)) {
            return NextResponse.json({ error: "Unknown purchase bill number format." }, { status: 400 });
          }
          updateData.purchaseBillNumberFormat = raw;
        } else {
          updateData.purchaseBillNumberFormat = null;
        }
        pushNumberingDetail("purchaseBillNumberFormat", `purchase bill number format -> ${updateData.purchaseBillNumberFormat ?? "(default)"}`);
      }

      if ("creditNoteNumberFormat" in body) {
        const raw = String(creditNoteNumberFormat ?? "").trim();
        if (raw) {
          if (!Object.hasOwn(NUMBER_FORMATS, raw)) {
            return NextResponse.json({ error: "Unknown credit note number format." }, { status: 400 });
          }
          updateData.creditNoteNumberFormat = raw;
        } else {
          updateData.creditNoteNumberFormat = null;
        }
        pushNumberingDetail("creditNoteNumberFormat", `credit note number format -> ${updateData.creditNoteNumberFormat ?? "(default)"}`);
      }

      const getInvoiceLastSeq = async () => {
        const effectivePrefix =
          ("invoiceNumberPrefix" in body ? (updateData.invoiceNumberPrefix as string | null) : existing?.invoiceNumberPrefix)
          || deriveDefaultPrefix(existing?.name || "Science Hub");
        const effectiveFormat = "invoiceNumberFormat" in body ? (updateData.invoiceNumberFormat as string | null) : existing?.invoiceNumberFormat;
        const candidatesThisYear = await prisma.invoice.findMany({
          where: { invoiceNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
          select: { invoiceNumber: true },
        });
        return findMaxSequence(candidatesThisYear.map((c) => c.invoiceNumber), resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel));
      };

      const getPurchaseBillLastSeq = async () => {
        const effectivePrefix =
          ("purchaseBillNumberPrefix" in body ? (updateData.purchaseBillNumberPrefix as string | null) : existing?.purchaseBillNumberPrefix)
          || "PB";
        const effectiveFormat = "purchaseBillNumberFormat" in body ? (updateData.purchaseBillNumberFormat as string | null) : existing?.purchaseBillNumberFormat;
        const candidatesThisYear = await prisma.purchaseBill.findMany({
          where: { billNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
          select: { billNumber: true },
        });
        return findMaxSequence(candidatesThisYear.map((c) => c.billNumber), resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel));
      };

      const getCreditNoteLastSeq = async () => {
        const effectivePrefix =
          ("creditNoteNumberPrefix" in body ? (updateData.creditNoteNumberPrefix as string | null) : existing?.creditNoteNumberPrefix)
          || "CN";
        const effectiveFormat = "creditNoteNumberFormat" in body ? (updateData.creditNoteNumberFormat as string | null) : existing?.creditNoteNumberFormat;
        const candidatesThisYear = await prisma.return.findMany({
          where: { creditNoteNumber: numberFormatDbFilter(effectiveFormat, effectivePrefix, currentYearLabel) },
          select: { creditNoteNumber: true },
        });
        return findMaxSequence(
          candidatesThisYear.map((c) => c.creditNoteNumber).filter((v): v is string => v !== null),
          resolveNumberFormat(effectiveFormat).matcher(effectivePrefix, currentYearLabel)
        );
      };

      if ("nextInvoiceNumberOverride" in body) {
        if (nextInvoiceNumberOverride === null || nextInvoiceNumberOverride === "" || nextInvoiceNumberOverride === undefined) {
          updateData.nextInvoiceNumberOverride = null;
        } else {
          const n = parseInt(String(nextInvoiceNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next invoice number must be a whole number greater than 0." }, { status: 400 });
          }
          const lastSeq = await getInvoiceLastSeq();
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next invoice number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextInvoiceNumberOverride = n;
        }
        pushNumberingDetail("nextInvoiceNumberOverride", `next invoice # -> ${updateData.nextInvoiceNumberOverride ?? "(cleared)"}`);
      } else if (("invoiceNumberPrefix" in body || "invoiceNumberFormat" in body) && existing?.nextInvoiceNumberOverride) {
        if (existing.nextInvoiceNumberOverride <= await getInvoiceLastSeq()) {
          updateData.nextInvoiceNumberOverride = null;
        }
      }

      if ("nextPurchaseBillNumberOverride" in body) {
        if (nextPurchaseBillNumberOverride === null || nextPurchaseBillNumberOverride === "" || nextPurchaseBillNumberOverride === undefined) {
          updateData.nextPurchaseBillNumberOverride = null;
        } else {
          const n = parseInt(String(nextPurchaseBillNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next purchase bill number must be a whole number greater than 0." }, { status: 400 });
          }
          const lastSeq = await getPurchaseBillLastSeq();
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next purchase bill number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextPurchaseBillNumberOverride = n;
        }
        pushNumberingDetail("nextPurchaseBillNumberOverride", `next purchase bill # -> ${updateData.nextPurchaseBillNumberOverride ?? "(cleared)"}`);
      } else if (("purchaseBillNumberPrefix" in body || "purchaseBillNumberFormat" in body) && existing?.nextPurchaseBillNumberOverride) {
        if (existing.nextPurchaseBillNumberOverride <= await getPurchaseBillLastSeq()) {
          updateData.nextPurchaseBillNumberOverride = null;
        }
      }

      if ("nextCreditNoteNumberOverride" in body) {
        if (nextCreditNoteNumberOverride === null || nextCreditNoteNumberOverride === "" || nextCreditNoteNumberOverride === undefined) {
          updateData.nextCreditNoteNumberOverride = null;
        } else {
          const n = parseInt(String(nextCreditNoteNumberOverride), 10);
          if (!Number.isInteger(n) || n <= 0) {
            return NextResponse.json({ error: "Next credit note number must be a whole number greater than 0." }, { status: 400 });
          }
          const lastSeq = await getCreditNoteLastSeq();
          if (n <= lastSeq) {
            return NextResponse.json({ error: `Next credit note number must be greater than the highest existing number this year (${lastSeq}).` }, { status: 400 });
          }
          updateData.nextCreditNoteNumberOverride = n;
        }
        pushNumberingDetail("nextCreditNoteNumberOverride", `next credit note # -> ${updateData.nextCreditNoteNumberOverride ?? "(cleared)"}`);
      } else if (("creditNoteNumberPrefix" in body || "creditNoteNumberFormat" in body) && existing?.nextCreditNoteNumberOverride) {
        if (existing.nextCreditNoteNumberOverride <= await getCreditNoteLastSeq()) {
          updateData.nextCreditNoteNumberOverride = null;
        }
      }
    }

    // Which non-numbering fields actually change (compared before the write). Encrypted fields are
    // compared against their decrypted stored value; neither value is ever logged.
    const changedFieldKeys: string[] = [];
    for (const key of Object.keys(SETTINGS_FIELD_LABELS)) {
      if (!(key in updateData)) continue;
      let prev: unknown = existingValues[key];
      let next: unknown = updateData[key];
      if (key === "bankAccountNumber") {
        prev = existing?.bankAccountNumber ? safeDecrypt(existing.bankAccountNumber).value : "";
        next = bankAccountNumber ?? "";
      } else if (key === "gmailAppPassword") {
        prev = existing?.gmailAppPassword ? safeDecrypt(existing.gmailAppPassword).value : "";
        next = gmailAppPassword || "";
      }
      if (!sameSettingValue(prev, next)) changedFieldKeys.push(key);
    }
    if (validatedLicenses !== undefined) {
      let existingLicensesRaw = existingValues.licenses;
      if (existingLicensesRaw === undefined && existing) {
        try {
          const rows = await prisma.$queryRaw<Array<{ licenses: unknown }>>`SELECT "licenses" FROM "BusinessSettings" WHERE "id" = 'singleton' LIMIT 1`;
          existingLicensesRaw = rows[0]?.licenses;
        } catch {
          existingLicensesRaw = [];
        }
      }
      const prevLicJson = JSON.stringify(normalizeBusinessLicenses(existingLicensesRaw));
      const nextLicJson = JSON.stringify(validatedLicenses);
      if (prevLicJson !== nextLicJson) changedFieldKeys.push("licenses");
    }
    const logoChange: "update_logo" | "remove_logo" | null =
      logoUrl !== undefined && !sameSettingValue(existing?.logoUrl, logoUrl || "")
        ? (logoUrl ? "update_logo" : "remove_logo")
        : null;

    const { gmailAppPassword: storedPassword, bankAccountNumber: storedAccountNumber, ...settings } = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...updateData },
      update: updateData,
    });
    if (validatedLicenses !== undefined) {
      const licJson = JSON.stringify(validatedLicenses);
      await prisma.$executeRaw`UPDATE "BusinessSettings" SET "licenses" = ${licJson}::jsonb WHERE "id" = 'singleton'`;
    }
    if (numberingActivityDetails.length > 0) {
      await logActivity(auth.session.user.id, "update_numbering_settings", `Updated document numbering: ${numberingActivityDetails.join(", ")}`);
    }
    if (changedFieldKeys.length > 0) {
      // Group by section, e.g. "Bank details (Account number, IFSC), Gmail sending account (App password)".
      const bySection = new Map<string, string[]>();
      for (const key of changedFieldKeys) {
        const { section, label } = SETTINGS_FIELD_LABELS[key];
        const labels = bySection.get(section) ?? [];
        if (label !== section) labels.push(label);
        bySection.set(section, labels);
      }
      const summary = [...bySection.entries()]
        .map(([section, labels]) => (labels.length ? `${section} (${labels.join(", ")})` : section))
        .join(", ");
      await logActivity(auth.session.user.id, "update_settings", `Updated business settings: ${summary}`);
    }
    if (logoChange) {
      await logActivity(
        auth.session.user.id,
        logoChange,
        logoChange === "update_logo" ? "Updated business logo" : "Removed business logo",
      );
    }
    // Delete the replaced/removed logo's old blob synchronously here rather than relying on a client-fired DELETE that a closed tab could skip.
    if (logoUrl !== undefined && existing?.logoUrl && existing.logoUrl !== (logoUrl || "")) {
      await deleteAttachmentBlob(existing.logoUrl);
    }
    revalidateTag("settings", { expire: 0 });
    const decryptedAccountNumber = storedAccountNumber ? safeDecrypt(storedAccountNumber) : { value: "", failed: false };
    let returnedLicenses = validatedLicenses;
    if (returnedLicenses === undefined) {
      let rawLic = (settings as { licenses?: unknown }).licenses;
      if (rawLic === undefined) {
        try {
          const rows = await prisma.$queryRaw<Array<{ licenses: unknown }>>`SELECT "licenses" FROM "BusinessSettings" WHERE "id" = 'singleton' LIMIT 1`;
          rawLic = rows[0]?.licenses;
        } catch {
          rawLic = [];
        }
      }
      returnedLicenses = normalizeBusinessLicenses(rawLic);
    }
    return NextResponse.json({
      ...settings,
      licenses: returnedLicenses,
      gmailAppPasswordSet: Boolean(storedPassword),
      bankAccountNumber: decryptedAccountNumber.value,
      bankAccountNumberDecryptFailed: decryptedAccountNumber.failed,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
