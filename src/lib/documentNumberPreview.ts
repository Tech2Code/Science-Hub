// Read-only "what number would this document get right now" preview, used by the New Invoice/New
// Purchase Bill pages and the invoice detail page's Record Return modal to show the upcoming
// document number before it's actually created. Runs the exact same computation the real create
// routes run inside their transaction (see /api/invoices, /api/purchase-bills,
// /api/invoices/[id]/returns), minus the transaction/insert/override-consumption — so it's purely
// informational: a document created by someone else in between can still change the real number.
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/db";
import {
  computeNextNumber,
  numberFormatDbFilter,
  getIndianFinancialYear,
  formatFinancialYearLabel,
  deriveDefaultPrefix,
} from "@/lib/documentNumbering";

export type PreviewDocType = "invoice" | "purchase_bill" | "credit_note";

export async function previewNextDocumentNumber(type: PreviewDocType, date: Date): Promise<string> {
  const biz = await getBusinessSettings();
  const yearLabel = formatFinancialYearLabel(getIndianFinancialYear(date));

  if (type === "invoice") {
    const prefix = biz.invoiceNumberPrefix || deriveDefaultPrefix(biz.name);
    const candidates = await prisma.invoice.findMany({
      where: { invoiceNumber: numberFormatDbFilter(biz.invoiceNumberFormat, prefix, yearLabel) },
      select: { invoiceNumber: true },
    });
    return computeNextNumber(candidates.map((c) => c.invoiceNumber), biz.invoiceNumberFormat, prefix, yearLabel, biz.nextInvoiceNumberOverride).documentNumber;
  }

  if (type === "purchase_bill") {
    const prefix = biz.purchaseBillNumberPrefix || "PB";
    const candidates = await prisma.purchaseBill.findMany({
      where: { billNumber: numberFormatDbFilter(biz.purchaseBillNumberFormat, prefix, yearLabel) },
      select: { billNumber: true },
    });
    return computeNextNumber(candidates.map((c) => c.billNumber), biz.purchaseBillNumberFormat, prefix, yearLabel, biz.nextPurchaseBillNumberOverride).documentNumber;
  }

  const prefix = biz.creditNoteNumberPrefix || "CN";
  const candidates = await prisma.return.findMany({
    where: { creditNoteNumber: numberFormatDbFilter(biz.creditNoteNumberFormat, prefix, yearLabel) },
    select: { creditNoteNumber: true },
  });
  const existing = candidates.map((c) => c.creditNoteNumber).filter((n): n is string => !!n);
  return computeNextNumber(existing, biz.creditNoteNumberFormat, prefix, yearLabel, biz.nextCreditNoteNumberOverride).documentNumber;
}
