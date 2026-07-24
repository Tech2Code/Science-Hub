// Assembles the data behind the "Download GST Package" feature — everything
// a business owner's CA needs each month/quarter to prepare GSTR-1 & GSTR-3B:
// Sales Register (split B2B/B2C), Credit Notes, Purchase Register, HSN
// Summary, and a GST Summary tying output tax to input tax credit (ITC).
// Also runs a validation pass over the same period so obvious filing
// mistakes (bad GSTIN, missing HSN, tax mismatches...) surface before the
// business owner sends the package to their CA.
import { prisma } from "@/lib/prisma";
import {
  isValidGstin, hasValidGstinStateCode, isStandardGstRate, amountsMatch, issue, type ValidationIssue,
} from "@/lib/gstValidation";

export interface SalesRegisterRow {
  invoiceNumber: string; date: Date; customerName: string; customerGstin: string;
  placeOfSupply: string; supplyType: "Inter-State" | "Intra-State"; isB2B: boolean;
  taxableValue: number; cgst: number; sgst: number; igst: number; total: number;
}

export interface CreditNoteRow {
  returnId: string; creditNoteNumber: string; date: Date; invoiceNumber: string; customerName: string; customerGstin: string;
  productName: string; quantity: number; taxableValue: number; gstRate: number;
  cgst: number; sgst: number; igst: number; total: number;
}

export interface PurchaseRegisterRow {
  billNumber: string; date: Date; vendorName: string; vendorGstin: string;
  taxableValue: number; taxAmount: number; total: number;
}

export interface HsnSummaryRow {
  hsn: string; gstRate: number; unit: string; totalQuantity: number;
  taxableValue: number; cgst: number; sgst: number; igst: number; total: number;
}

export interface GstFilingReport {
  period: { startDate: string; endDate: string; label: string };
  company: { name: string; gstin: string; pan: string; state: string; address: string; gstinValid: boolean };
  salesRegister: SalesRegisterRow[];
  b2bSales: SalesRegisterRow[];
  b2cSales: SalesRegisterRow[];
  creditNotes: CreditNoteRow[];
  purchaseRegister: PurchaseRegisterRow[];
  hsnSummary: HsnSummaryRow[];
  summary: {
    outputTaxable: number; outputCgst: number; outputSgst: number; outputIgst: number; outputTax: number;
    creditNoteTaxable: number; creditNoteTax: number;
    netOutputTax: number;
    inputTaxable: number; inputTax: number;
    netGstPayable: number;
  };
  validation: { issues: ValidationIssue[]; errorCount: number; warningCount: number };
}

export async function buildGstFilingReport(startDate: string, endDate: string): Promise<GstFilingReport> {
  const start = new Date(startDate);
  const end = new Date(new Date(endDate).getTime() + 86400000 - 1); // inclusive of the full end day

  const [settings, invoices, returns, bills] = await Promise.all([
    prisma.businessSettings.findUnique({ where: { id: "singleton" } }),
    prisma.invoice.findMany({
      where: { deletedAt: null, date: { gte: start, lte: end } },
      include: { customer: { select: { name: true, gstin: true, state: true } }, items: true },
      orderBy: { date: "asc" },
    }),
    prisma.return.findMany({
      where: { date: { gte: start, lte: end }, deletedAt: null, invoice: { deletedAt: null } },
      include: {
        items: true,
        invoice: { select: { invoiceNumber: true, isInterState: true, customer: { select: { name: true, gstin: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: start, lte: end } },
      include: { vendor: { select: { name: true, gstin: true } } },
      orderBy: { billDate: "asc" },
    }),
  ]);

  const issues: ValidationIssue[] = [];

  // ── Company info ──────────────────────────────────────────────────────
  const companyGstin = (settings?.gstin ?? "").trim();
  const company = {
    name: settings?.name ?? "", gstin: companyGstin, pan: settings?.pan ?? "",
    state: settings?.state ?? "", address: settings?.address ?? "",
    gstinValid: companyGstin ? isValidGstin(companyGstin) : false,
  };
  if (!companyGstin) {
    issues.push(issue("error", "Company Details", "Business GSTIN is not set in Settings — required on every GST return."));
  } else if (!isValidGstin(companyGstin)) {
    issues.push(issue("error", "Company Details", `Business GSTIN "${companyGstin}" does not match the standard 15-character GSTIN format.`));
  }
  if (!(settings?.state ?? "").trim()) {
    issues.push(issue("warning", "Company Details", "Business state is not set in Settings."));
  }

  // ── Sales register + HSN summary ─────────────────────────────────────
  const salesRegister: SalesRegisterRow[] = [];
  const hsnMap = new Map<string, HsnSummaryRow>();
  const seenInvoiceNumbers = new Map<string, number>();

  for (const inv of invoices) {
    seenInvoiceNumbers.set(inv.invoiceNumber, (seenInvoiceNumbers.get(inv.invoiceNumber) ?? 0) + 1);

    const customerGstin = (inv.customer.gstin ?? "").trim();
    const isB2B = customerGstin.length > 0;
    if (isB2B && !isValidGstin(customerGstin)) {
      issues.push(issue("error", "Sales", `Customer GSTIN "${customerGstin}" on invoice ${inv.invoiceNumber} is not a valid 15-character GSTIN.`, inv.invoiceNumber));
    } else if (isB2B && !hasValidGstinStateCode(customerGstin)) {
      issues.push(issue("warning", "Sales", `Customer GSTIN "${customerGstin}" on invoice ${inv.invoiceNumber} has an unrecognized state code.`, inv.invoiceNumber));
    }
    // Legacy invoices predate `placeOfSupply` becoming a required field —
    // for a plain sale with no separate delivery address, place of supply
    // is legally the customer's registered state, so fall back to that
    // before treating it as genuinely missing (matches the Sales Register's
    // own display fallback below).
    if (!(inv.placeOfSupply ?? inv.customer.state ?? "").trim()) {
      issues.push(issue("warning", "Sales", `Invoice ${inv.invoiceNumber} has no place of supply recorded, and the customer has no state on file to fall back to.`, inv.invoiceNumber));
    }

    const itemTaxSum = inv.items.reduce((s, it) => s + it.gstAmount, 0);
    if (!amountsMatch(inv.cgst + inv.sgst + inv.igst, itemTaxSum)) {
      issues.push(issue("error", "Sales", `Invoice ${inv.invoiceNumber}: stored tax (₹${(inv.cgst + inv.sgst + inv.igst).toFixed(2)}) doesn't match line-item tax (₹${itemTaxSum.toFixed(2)}).`, inv.invoiceNumber));
    }
    const expectedTotal = inv.subtotal + inv.cgst + inv.sgst + inv.igst + inv.roundOff;
    if (!amountsMatch(inv.total, expectedTotal)) {
      issues.push(issue("error", "Sales", `Invoice ${inv.invoiceNumber}: total (₹${inv.total.toFixed(2)}) doesn't match subtotal + tax + round-off (₹${expectedTotal.toFixed(2)}).`, inv.invoiceNumber));
    }

    for (const it of inv.items) {
      if (!it.hsn.trim()) {
        issues.push(issue("warning", "Sales", `Missing HSN code on invoice ${inv.invoiceNumber} for "${it.name}".`, inv.invoiceNumber));
      }
      if (!isStandardGstRate(it.gstRate)) {
        issues.push(issue("warning", "Sales", `Unusual GST rate ${it.gstRate}% on invoice ${inv.invoiceNumber} for "${it.name}".`, inv.invoiceNumber));
      }
      const taxable = it.total - it.gstAmount;
      const key = `${it.hsn.trim() || "—"}|${it.gstRate}`;
      const existing = hsnMap.get(key);
      const cgstShare = inv.isInterState ? 0 : it.gstAmount / 2;
      const sgstShare = inv.isInterState ? 0 : it.gstAmount / 2;
      const igstShare = inv.isInterState ? it.gstAmount : 0;
      if (existing) {
        existing.totalQuantity += it.quantity;
        existing.taxableValue += taxable;
        existing.cgst += cgstShare; existing.sgst += sgstShare; existing.igst += igstShare;
        existing.total += it.total;
        if (existing.unit !== it.unit) existing.unit = "Mixed";
      } else {
        hsnMap.set(key, {
          hsn: it.hsn.trim() || "—", gstRate: it.gstRate, unit: it.unit, totalQuantity: it.quantity,
          taxableValue: taxable, cgst: cgstShare, sgst: sgstShare, igst: igstShare, total: it.total,
        });
      }
    }

    salesRegister.push({
      invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customer.name,
      customerGstin, placeOfSupply: inv.placeOfSupply ?? inv.customer.state ?? "",
      supplyType: inv.isInterState ? "Inter-State" : "Intra-State", isB2B,
      taxableValue: inv.subtotal, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, total: inv.total,
    });
  }

  for (const [invoiceNumber, count] of seenInvoiceNumbers) {
    if (count > 1) issues.push(issue("error", "Sales", `Invoice number ${invoiceNumber} appears ${count} times in this period.`, invoiceNumber));
  }

  const b2bSales = salesRegister.filter((r) => r.isB2B);
  const b2cSales = salesRegister.filter((r) => !r.isB2B);
  const hsnSummary = Array.from(hsnMap.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));

  // ── Credit notes (sales returns) ─────────────────────────────────────
  // Each line's GST was already computed and stored at credit-note creation
  // time (src/app/api/invoices/[id]/returns/route.ts), inheriting its rate
  // from the original invoice line — no re-derivation needed here.
  const creditNotes: CreditNoteRow[] = [];
  for (const ret of returns) {
    const inv = ret.invoice;
    if (!ret.creditNoteNumber) {
      issues.push(issue("warning", "Sales", `A credit note against invoice ${inv.invoiceNumber} has no credit note number (predates numbering) — assign one before filing.`, inv.invoiceNumber));
    }
    for (const ri of ret.items) {
      const gstAmt = ri.gstAmount;
      creditNotes.push({
        returnId: ret.id,
        creditNoteNumber: ret.creditNoteNumber ?? "—",
        date: ret.date, invoiceNumber: inv.invoiceNumber, customerName: inv.customer.name,
        customerGstin: (inv.customer.gstin ?? "").trim(), productName: ri.name, quantity: ri.quantity,
        taxableValue: ri.total - gstAmt, gstRate: ri.gstRate,
        cgst: inv.isInterState ? 0 : gstAmt / 2, sgst: inv.isInterState ? 0 : gstAmt / 2, igst: inv.isInterState ? gstAmt : 0,
        total: ri.total,
      });
    }
  }

  // ── Purchase register ─────────────────────────────────────────────────
  const purchaseRegister: PurchaseRegisterRow[] = [];
  for (const b of bills) {
    const vendorGstin = (b.vendor.gstin ?? "").trim();
    if (vendorGstin && !isValidGstin(vendorGstin)) {
      issues.push(issue("warning", "Purchases", `Vendor GSTIN "${vendorGstin}" on bill ${b.billNumber} is not a valid 15-character GSTIN.`, b.billNumber));
    }
    if (!vendorGstin && b.taxAmount > 0) {
      issues.push(issue("error", "Purchases", `Bill ${b.billNumber} includes GST (₹${b.taxAmount.toFixed(2)}) but vendor "${b.vendor.name}" has no GSTIN on file — ITC cannot be claimed without one.`, b.billNumber));
    }
    purchaseRegister.push({
      billNumber: b.billNumber, date: b.billDate, vendorName: b.vendor.name, vendorGstin,
      taxableValue: b.subtotal, taxAmount: b.taxAmount, total: b.total,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const outputTaxable = salesRegister.reduce((s, r) => s + r.taxableValue, 0);
  const outputCgst = salesRegister.reduce((s, r) => s + r.cgst, 0);
  const outputSgst = salesRegister.reduce((s, r) => s + r.sgst, 0);
  const outputIgst = salesRegister.reduce((s, r) => s + r.igst, 0);
  const outputTax = outputCgst + outputSgst + outputIgst;
  const creditNoteTaxable = creditNotes.reduce((s, r) => s + r.taxableValue, 0);
  const creditNoteTax = creditNotes.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
  const inputTaxable = purchaseRegister.reduce((s, r) => s + r.taxableValue, 0);
  const inputTax = purchaseRegister.reduce((s, r) => s + r.taxAmount, 0);
  const netOutputTax = outputTax - creditNoteTax;

  return {
    period: { startDate, endDate, label: `${new Date(startDate).toLocaleDateString("en-IN")} – ${new Date(endDate).toLocaleDateString("en-IN")}` },
    company,
    salesRegister, b2bSales, b2cSales, creditNotes, purchaseRegister, hsnSummary,
    summary: {
      outputTaxable, outputCgst, outputSgst, outputIgst, outputTax,
      creditNoteTaxable, creditNoteTax, netOutputTax,
      inputTaxable, inputTax,
      netGstPayable: netOutputTax - inputTax,
    },
    validation: {
      issues,
      errorCount: issues.filter((i) => i.severity === "error").length,
      warningCount: issues.filter((i) => i.severity === "warning").length,
    },
  };
}
