import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";
import { encrypt, decrypt } from "@/lib/crypto";
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
    const { gmailAppPassword, gmailUser, ...settings } = await getBusinessSettings();
    const showLogoOnInvoices = await readShowLogoOnInvoices();
    // Non-admins (e.g. staff viewing/printing an invoice, which needs the
    // letterhead fields below) must not see the Gmail send-from address —
    // only admins, who manage it on the Settings page, get it back.
    const isAdmin = auth.session.user.role === "admin";
    return NextResponse.json({
      ...settings,
      showLogoOnInvoices,
      ...(isAdmin ? { gmailUser, gmailAppPasswordSet: Boolean(gmailAppPassword) } : {}),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

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
    const validationError = validateSettingsInput({
      pan, termsAndConditions, phone, pincode, gstin, bankName, bankAccountNumber, bankIfsc, bankBranch,
    });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await prisma.businessSettings.findUnique({ where: { id: "singleton" }, select: { updatedAt: true } });
    if (existing && expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "Business settings were updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }
    const updateData: Record<string, string> = {
      name, tagline, email, phone, address, city, state, pincode, gstin, pan: (pan ?? "").toUpperCase(), gmailUser: gmailUser ?? "",
      bankName: bankName ?? "", bankAccountName: bankAccountName ?? "", bankIfsc: bankIfsc ?? "", bankBranch: bankBranch ?? "",
      termsAndConditions: termsAndConditions ?? "",
    };
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl ?? "";
    // Save password when explicitly provided; if gmailUser is being cleared, clear password too
    if (gmailAppPassword) updateData.gmailAppPassword = encrypt(gmailAppPassword);
    else if (!gmailUser) updateData.gmailAppPassword = "";
    updateData.bankAccountNumber = bankAccountNumber ? encrypt(bankAccountNumber) : "";
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
    return NextResponse.json({
      ...settings,
      showLogoOnInvoices: savedShowLogoOnInvoices,
      gmailAppPasswordSet: Boolean(storedPassword),
      bankAccountNumber: storedAccountNumber ? decrypt(storedAccountNumber) : "",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
