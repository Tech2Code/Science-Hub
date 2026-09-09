// Assembles the GSTR-1/GSTR-3B filing data (Sales/Purchase Register, Credit Notes, HSN
// Summary, GST Summary) and validates it (bad GSTIN, missing HSN, tax mismatches...) for the CA.
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import {
  isValidGstin, hasValidGstinStateCode, isStandardGstRate, amountsMatch, issue, type ValidationIssue,
} from "@/lib/gstValidation";
import { istDayStartUtc, istDayEndUtc } from "@/lib/validation";
import { getGstPosLabel } from "@/lib/gstStateCodes";

// Same resolvability check the GSTR-1 CSV exporter (`resolvePos()` in gstr1CsvExport.ts) uses to
// drop a row it can't place — applied here too so the headline summary/HSN-B2B/HSN-B2C figures
// never count something the CSV export silently excludes (an earlier version of this report let
// the two diverge: an invoice with an unrecognized place-of-supply state stayed in the on-screen
// "Net GST Payable"/HSN totals while being dropped from the actual filed CSV).
function isPosResolvable(stateName: string): boolean {
  return !!getGstPosLabel(stateName);
}

export interface SalesRegisterRow {
  invoiceNumber: string; date: Date; customerName: string; customerGstin: string;
  placeOfSupply: string; supplyType: "Inter-State" | "Intra-State"; isB2B: boolean; reverseCharge: boolean;
  taxableValue: number; cgst: number; sgst: number; igst: number; total: number;
}

// One row per (invoice, GST rate) — GSTR-1's B2B/B2CS sections require tax-rate-wise
// splitting when a single invoice mixes items at different rates; SalesRegisterRow's
// invoice-level totals can't express that, so this is built alongside it from the same items.
export interface SalesRateRow {
  invoiceNumber: string; date: Date; customerName: string; customerGstin: string;
  placeOfSupply: string; supplyType: "Inter-State" | "Intra-State"; isB2B: boolean; reverseCharge: boolean;
  gstRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; total: number;
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
  salesRegisterByRate: SalesRateRow[];
  b2bSales: SalesRegisterRow[];
  b2cSales: SalesRegisterRow[];
  creditNotes: CreditNoteRow[];
  purchaseRegister: PurchaseRegisterRow[];
  hsnSummary: HsnSummaryRow[];
  hsnSummaryB2B: HsnSummaryRow[];
  hsnSummaryB2C: HsnSummaryRow[];
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
  // IST-day boundaries — a bare UTC-midnight parse would clip the first ~5.5 IST hours of the
  // start day and the last ~5.5 IST hours of the end day, silently excluding real filing-period
  // documents from a legally-significant GST report.
  const start = istDayStartUtc(startDate);
  const end = istDayEndUtc(endDate);

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
        invoice: { select: { invoiceNumber: true, isInterState: true, placeOfSupply: true, customer: { select: { name: true, gstin: true, state: true } } } },
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
  const salesRateMap = new Map<string, SalesRateRow>();
  const hsnMap = new Map<string, HsnSummaryRow>();
  const hsnMapB2B = new Map<string, HsnSummaryRow>();
  const hsnMapB2C = new Map<string, HsnSummaryRow>();
  const seenInvoiceNumbers = new Map<string, number>();
  // Transport charge carries its own GST, kept in a separate DB column from cgst/sgst/igst by
  // design (Invoice.transportCharge) so the Sales Register's cgst/sgst/igst columns keep matching
  // the invoice's own item-tax-only columns — but it's still real output tax collected from the
  // customer, so it must still be folded into the headline "Net GST Payable" summary. Accumulated
  // separately here rather than inside SalesRegisterRow so the register's per-invoice display and
  // the payable total don't have to agree on what "cgst"/"sgst"/"igst" means. Only invoices whose
  // place-of-supply actually resolves are counted, matching what the CSV/HSN exports below include.
  let transportOutputTaxable = 0, transportOutputCgst = 0, transportOutputSgst = 0, transportOutputIgst = 0;

  for (const inv of invoices) {
    seenInvoiceNumbers.set(inv.invoiceNumber, (seenInvoiceNumbers.get(inv.invoiceNumber) ?? 0) + 1);

    const customerGstin = (inv.customer.gstin ?? "").trim();
    const isB2B = customerGstin.length > 0;
    if (isB2B && !isValidGstin(customerGstin)) {
      issues.push(issue("error", "Sales", `Customer GSTIN "${customerGstin}" on invoice ${inv.invoiceNumber} is not a valid 15-character GSTIN.`, inv.invoiceNumber));
    } else if (isB2B && !hasValidGstinStateCode(customerGstin)) {
      issues.push(issue("warning", "Sales", `Customer GSTIN "${customerGstin}" on invoice ${inv.invoiceNumber} has an unrecognized state code.`, inv.invoiceNumber));
    }
    // Legacy invoices predate `placeOfSupply`; fall back to the customer's registered state
    // before treating it as missing (matches the Sales Register's own display fallback below).
    const posValue = inv.placeOfSupply ?? inv.customer.state ?? "";
    if (!posValue.trim()) {
      issues.push(issue("warning", "Sales", `Invoice ${inv.invoiceNumber} has no place of supply recorded, and the customer has no state on file to fall back to.`, inv.invoiceNumber));
    }
    // The GSTR-1 CSV exporter drops any row whose place-of-supply doesn't match a recognized
    // GST state/UT (see gstr1CsvExport.ts's resolvePos()) — this invoice's HSN-B2B/HSN-B2C and
    // output-tax contribution must be excluded on the same condition, or the on-screen summary
    // counts something the actual filed CSV omits.
    const posOk = isPosResolvable(posValue);
    if (posValue.trim() && !posOk) {
      issues.push(issue("warning", "Sales", `Place of supply "${posValue}" on invoice ${inv.invoiceNumber} doesn't match a recognized GST state/UT — excluded from the HSN Summary and Net GST Payable totals (it will also be skipped by the GSTR-1 CSV export).`, inv.invoiceNumber));
    }

    const itemTaxSum = inv.items.reduce((s, it) => s + it.gstAmount, 0);
    if (!amountsMatch(inv.cgst + inv.sgst + inv.igst, itemTaxSum)) {
      issues.push(issue("error", "Sales", `Invoice ${inv.invoiceNumber}: stored tax (₹${(inv.cgst + inv.sgst + inv.igst).toFixed(2)}) doesn't match line-item tax (₹${itemTaxSum.toFixed(2)}).`, inv.invoiceNumber));
    }
    // Transport charge (+ its GST) is a real separate addition to the total (invoiceCalc.ts) — must be included here too.
    const expectedTotal = inv.subtotal + inv.cgst + inv.sgst + inv.igst + inv.transportCharge + inv.transportChargeGstAmount + inv.roundOff;
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

      // HSN-B2B/HSN-B2C feed the GSTR-1 CSV export, which drops any row whose place-of-supply
      // doesn't resolve — so only fold this item into the split maps when it would also survive
      // that CSV's own filter (the combined `hsnMap` above stays unfiltered — it isn't part of
      // the CSV zip, so it's meant to show every item regardless of a POS ambiguity).
      if (posOk) {
        const splitMap = isB2B ? hsnMapB2B : hsnMapB2C;
        const splitExisting = splitMap.get(key);
        if (splitExisting) {
          splitExisting.totalQuantity += it.quantity;
          splitExisting.taxableValue += taxable;
          splitExisting.cgst += cgstShare; splitExisting.sgst += sgstShare; splitExisting.igst += igstShare;
          splitExisting.total += it.total;
          if (splitExisting.unit !== it.unit) splitExisting.unit = "Mixed";
        } else {
          splitMap.set(key, {
            hsn: it.hsn.trim() || "—", gstRate: it.gstRate, unit: it.unit, totalQuantity: it.quantity,
            taxableValue: taxable, cgst: cgstShare, sgst: sgstShare, igst: igstShare, total: it.total,
          });
        }
      }

      const rateKey = `${inv.invoiceNumber}|${it.gstRate}`;
      const rateExisting = salesRateMap.get(rateKey);
      if (rateExisting) {
        rateExisting.taxableValue += taxable;
        rateExisting.cgst += cgstShare; rateExisting.sgst += sgstShare; rateExisting.igst += igstShare;
        rateExisting.total += it.total;
      } else {
        salesRateMap.set(rateKey, {
          invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customer.name, customerGstin,
          placeOfSupply: posValue,
          supplyType: inv.isInterState ? "Inter-State" : "Intra-State", isB2B, reverseCharge: inv.reverseCharge,
          gstRate: it.gstRate, taxableValue: taxable, cgst: cgstShare, sgst: sgstShare, igst: igstShare, total: it.total,
        });
      }
    }

    // Transport/freight charge is a real taxable addition to the invoice (invoiceCalc.ts) with
    // its own GST rate, possibly different from every item's rate — fold it into the same
    // per-(invoice, rate) bucket the items above use, so a mixed-rate invoice's rate-wise rows
    // still sum back to the invoice's real total instead of falling short by the transport
    // portion (this previously caused salesRegisterByRate — and therefore the B2B CSV's
    // rate-wise rows — to under-total any invoice carrying a transport charge).
    if (inv.transportCharge) {
      const tCgst = inv.isInterState ? 0 : inv.transportChargeGstAmount / 2;
      const tSgst = inv.isInterState ? 0 : inv.transportChargeGstAmount / 2;
      const tIgst = inv.isInterState ? inv.transportChargeGstAmount : 0;
      const rateKey = `${inv.invoiceNumber}|${inv.transportChargeGstRate}`;
      const rateExisting = salesRateMap.get(rateKey);
      if (rateExisting) {
        rateExisting.taxableValue += inv.transportCharge;
        rateExisting.cgst += tCgst; rateExisting.sgst += tSgst; rateExisting.igst += tIgst;
        rateExisting.total += inv.transportCharge + inv.transportChargeGstAmount;
      } else {
        salesRateMap.set(rateKey, {
          invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customer.name, customerGstin,
          placeOfSupply: posValue,
          supplyType: inv.isInterState ? "Inter-State" : "Intra-State", isB2B, reverseCharge: inv.reverseCharge,
          gstRate: inv.transportChargeGstRate, taxableValue: inv.transportCharge, cgst: tCgst, sgst: tSgst, igst: tIgst,
          total: inv.transportCharge + inv.transportChargeGstAmount,
        });
      }
      if (posOk) {
        transportOutputTaxable += inv.transportCharge;
        transportOutputCgst += tCgst; transportOutputSgst += tSgst; transportOutputIgst += tIgst;
      }
    }

    salesRegister.push({
      invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customer.name,
      customerGstin, placeOfSupply: posValue,
      supplyType: inv.isInterState ? "Inter-State" : "Intra-State", isB2B, reverseCharge: inv.reverseCharge,
      taxableValue: inv.subtotal, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, total: inv.total,
    });
  }

  for (const [invoiceNumber, count] of seenInvoiceNumbers) {
    if (count > 1) issues.push(issue("error", "Sales", `Invoice number ${invoiceNumber} appears ${count} times in this period.`, invoiceNumber));
  }

  const b2bSales = salesRegister.filter((r) => r.isB2B);
  const b2cSales = salesRegister.filter((r) => !r.isB2B);
  // One row per invoice already (salesRegister.push runs once per invoice above), so this is a
  // safe 1:1 lookup — used below to apply the exact same "was this invoice actually filed"
  // condition the CDNR CSV uses (see gstr1CsvExport.ts: a credit note is dropped from cdnr.csv
  // when its invoice isn't in-period or its place-of-supply doesn't resolve).
  const posOkByInvoiceNumber = new Map(salesRegister.map((r) => [r.invoiceNumber, isPosResolvable(r.placeOfSupply)]));
  const hsnSummary = Array.from(hsnMap.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
  const hsnSummaryB2B = Array.from(hsnMapB2B.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
  const hsnSummaryB2C = Array.from(hsnMapB2C.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
  const salesRegisterByRate = Array.from(salesRateMap.values());

  // ── Credit notes (sales returns) ─────────────────────────────────────
  // Each line's GST was already computed/stored at credit-note creation time — no re-derivation needed.
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
    // Transport/freight charge on a purchase bill is real ITC-eligible tax paid to the vendor —
    // folded into the register's own taxableValue/taxAmount (unlike the sales side, there's no
    // per-rate CSV export for purchases to keep in sync, so this can live directly on the row).
    purchaseRegister.push({
      billNumber: b.billNumber, date: b.billDate, vendorName: b.vendor.name, vendorGstin,
      taxableValue: b.subtotal + b.transportCharge, taxAmount: b.taxAmount + b.transportChargeGstAmount, total: b.total,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  // Item-level output tax (Sales Register rows carry each invoice's own stored cgst/sgst/igst,
  // which are item-tax-only by design) plus the transport-charge output tax accumulated above —
  // both filtered to place-of-supply-resolvable invoices, matching the GSTR-1 CSV export.
  const outputTaxable = salesRegister.reduce((s, r) => (isPosResolvable(r.placeOfSupply) ? s + r.taxableValue : s), 0) + transportOutputTaxable;
  const outputCgst = salesRegister.reduce((s, r) => (isPosResolvable(r.placeOfSupply) ? s + r.cgst : s), 0) + transportOutputCgst;
  const outputSgst = salesRegister.reduce((s, r) => (isPosResolvable(r.placeOfSupply) ? s + r.sgst : s), 0) + transportOutputSgst;
  const outputIgst = salesRegister.reduce((s, r) => (isPosResolvable(r.placeOfSupply) ? s + r.igst : s), 0) + transportOutputIgst;
  const outputTax = outputCgst + outputSgst + outputIgst;
  // Excludes a credit note with no assigned number, or whose invoice is out-of-period/unresolvable
  // place-of-supply — the same conditions under which cdnr.csv drops that row (see resolvePos() /
  // the `if (!invoiceRow) continue` and `if (cn.creditNoteNumber === "—") continue` guards in
  // gstr1CsvExport.ts) — so "Net GST Payable" never nets out more credit-note tax than the actual
  // filed CSV accounts for.
  const filedCreditNotes = creditNotes.filter((r) => r.creditNoteNumber !== "—" && (posOkByInvoiceNumber.get(r.invoiceNumber) ?? false));
  const creditNoteTaxable = filedCreditNotes.reduce((s, r) => s + r.taxableValue, 0);
  const creditNoteTax = filedCreditNotes.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
  const inputTaxable = purchaseRegister.reduce((s, r) => s + r.taxableValue, 0);
  const inputTax = purchaseRegister.reduce((s, r) => s + r.taxAmount, 0);
  const netOutputTax = outputTax - creditNoteTax;

  return {
    period: { startDate, endDate, label: `${formatDate(startDate)} – ${formatDate(endDate)}` },
    company,
    salesRegister, salesRegisterByRate, b2bSales, b2cSales, creditNotes, purchaseRegister,
    hsnSummary, hsnSummaryB2B, hsnSummaryB2C,
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
