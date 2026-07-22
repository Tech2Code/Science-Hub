import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";
import { encrypt, safeDecrypt } from "@/lib/crypto";
import { validateSettingsInput } from "@/lib/validation";

let invoiceLogoColumnReady = false;

async function ensureInvoiceLogoColumn() {
  if (invoiceLogoColumnReady) return;
  await prisma.$executeRaw`
    ALTER TABLE "BusinessSettings"
    ADD COLUMN IF NOT EXISTS "showLogoOnInvoices" BOOLEAN NOT NULL DEFAULT true
  `;
  invoiceLogoColumnReady = true;
}

async function readShowLogoOnInvoices(): Promise<boolean> {
  await ensureInvoiceLogoColumn();
  const rows = await prisma.$queryRaw<{ showLogoOnInvoices: boolean }[]>`
    SELECT "showLogoOnInvoices" FROM "BusinessSettings" WHERE id = 'singleton' LIMIT 1
  `;
  return rows[0]?.showLogoOnInvoices ?? true;
}

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    await ensureInvoiceLogoColumn();
    const { gmailAppPassword, gmailAppPasswordDecryptFailed, gmailUser, ...settings } = await getBusinessSettings();
    const showLogoOnInvoices = await readShowLogoOnInvoices();
    // Non-admins (e.g. staff viewing/printing an invoice, which needs the
    // letterhead fields below) must not see the Gmail send-from address —
    // only admins, who manage it on the Settings page, get it back.
    const isAdmin = auth.session.user.role === "admin";
    return NextResponse.json({
      ...settings,
      showLogoOnInvoices,
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

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    await ensureInvoiceLogoColumn();
    const body = await request.json();
    const {
      name, tagline, email, phone, address, city, state, pincode, gstin, pan, gmailUser, gmailAppPassword,
      bankName, bankAccountName, bankAccountNumber, bankIfsc, bankBranch, termsAndConditions, logoUrl, showLogoOnInvoices, expectedUpdatedAt,
    } = body;
    const fieldValues: Record<string, string | undefined> = {
      name, tagline, email, phone, address, city, state, pincode, gstin, termsAndConditions,
      bankName, bankAccountName, bankAccountNumber, bankIfsc, bankBranch,
    };
    const isBankSectionUpdate = BANK_KEYS.some((k) => k in body);

    const validationError = validateSettingsInput(
      { pan, termsAndConditions, phone, pincode, gstin, bankName, bankAccountNumber, bankIfsc, bankBranch },
      isBankSectionUpdate,
    );
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await prisma.businessSettings.findUnique({ where: { id: "singleton" }, select: { updatedAt: true } });
    if (existing && expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "Business settings were updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const updateData: Record<string, string> = {};
    for (const key of SIMPLE_STRING_KEYS) {
      if (key in body) updateData[key] = fieldValues[key] ?? "";
    }
    if ("pan" in body) updateData.pan = (pan ?? "").toUpperCase();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl ?? "";
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

    const { gmailAppPassword: storedPassword, bankAccountNumber: storedAccountNumber, ...settings } = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...updateData },
      update: updateData,
    });
    if (showLogoOnInvoices !== undefined) {
      await ensureInvoiceLogoColumn();
      await prisma.$executeRaw`
        UPDATE "BusinessSettings"
        SET "showLogoOnInvoices" = ${Boolean(showLogoOnInvoices)}
        WHERE id = 'singleton'
      `;
    }
    const savedShowLogoOnInvoices = await readShowLogoOnInvoices();
    const decryptedAccountNumber = storedAccountNumber ? safeDecrypt(storedAccountNumber) : { value: "", failed: false };
    return NextResponse.json({
      ...settings,
      showLogoOnInvoices: savedShowLogoOnInvoices,
      gmailAppPasswordSet: Boolean(storedPassword),
      bankAccountNumber: decryptedAccountNumber.value,
      bankAccountNumberDecryptFailed: decryptedAccountNumber.failed,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
