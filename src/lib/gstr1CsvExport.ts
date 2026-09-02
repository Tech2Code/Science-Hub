// Builds the GSTR-1 section-wise CSV files exactly as documented in the GST Returns Offline
// Tool's own bundled sample files (Section_wise_CSV_files/GSTR1/*.csv, Offline Tool V3.2.4) —
// header row and column order verified against that official bundle, not guessed from
// third-party docs. A user imports each CSV individually via the Offline Tool's
// "Prepare Return > Import Files" flow, per section, then generates the upload JSON there.
//
// Deliberately out of scope (this app has no need for them, so the sheets are omitted rather
// than emitted empty): b2cl (large B2C invoices ≥ the invoice-wise threshold — this app's B2C
// sales are aggregated as b2cs regardless of value), sez/deemed-export/e-commerce-operator
// invoice types, exports, advances (at/atadj). If any of those become real for this business,
// extend here rather than building a second exporter.
import type { GstFilingReport, SalesRateRow, CreditNoteRow, HsnSummaryRow } from "@/lib/gstFiling";
import { getGstPosLabel } from "@/lib/gstStateCodes";
import { mapUnitToUqc } from "@/lib/gstUqc";
import { issue, type ValidationIssue } from "@/lib/gstValidation";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Offline Tool V3.2.4's own import validator reports the expected format as "dd-mmm-yyyy"
// (4-digit year, zero-padded day) — confirmed from a real "invalid date format" rejection,
// which is more current than the 2-digit-year dates in the tool's bundled sample CSVs.
function formatGstDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// No BOM here (unlike the human-facing validation CSV) — these files are read by the GST
// Offline Tool's own CSV parser, not opened in Excel, and every value in them is plain ASCII.
function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface Gstr1CsvFile {
  name: string;
  content: string;
}

export interface Gstr1CsvResult {
  files: Gstr1CsvFile[];
  issues: ValidationIssue[];
}

export function buildGstr1CsvFiles(report: GstFilingReport): Gstr1CsvResult {
  const issues: ValidationIssue[] = [];
  const invoiceTotalByNumber = new Map(report.salesRegister.map((r) => [r.invoiceNumber, r]));

  function resolvePos(stateName: string, reference: string): string {
    const label = getGstPosLabel(stateName);
    if (!label) {
      issues.push(issue(
        "error", "GST Filing Export",
        `Place of supply "${stateName}" on ${reference} doesn't match a recognized GST state/UT — this row was skipped from the export.`,
        reference,
      ));
    }
    return label ?? "";
  }

  // ── b2b,sez,de.csv ──────────────────────────────────────────────────────
  const b2bRows: (string | number)[][] = [];
  for (const r of report.salesRegisterByRate.filter((r): r is SalesRateRow => r.isB2B)) {
    const pos = resolvePos(r.placeOfSupply, `invoice ${r.invoiceNumber}`);
    if (!pos) continue;
    const invoiceTotal = invoiceTotalByNumber.get(r.invoiceNumber)?.total ?? r.total;
    b2bRows.push([
      r.customerGstin, r.customerName, r.invoiceNumber, formatGstDate(r.date), round2(invoiceTotal),
      pos, r.reverseCharge ? "Y" : "N", "", "Regular B2B", "", r.gstRate, round2(r.taxableValue), "",
    ]);
  }
  const b2bCsv = toCsv(
    ["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date", "Invoice Value",
      "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate", "Invoice Type", "E-Commerce GSTIN",
      "Rate", "Taxable Value", "Cess Amount"],
    b2bRows,
  );

  // ── b2cs.csv ────────────────────────────────────────────────────────────
  // B2C is reported as a place-of-supply + rate aggregate, not invoice-wise — matches how the
  // vast majority of small businesses (below the invoice-wise B2C threshold) file this section.
  const b2csMap = new Map<string, { pos: string; rate: number; taxableValue: number }>();
  for (const r of report.salesRegisterByRate.filter((r): r is SalesRateRow => !r.isB2B)) {
    const pos = resolvePos(r.placeOfSupply, `invoice ${r.invoiceNumber}`);
    if (!pos) continue;
    const key = `${pos}|${r.gstRate}`;
    const existing = b2csMap.get(key);
    if (existing) existing.taxableValue += r.taxableValue;
    else b2csMap.set(key, { pos, rate: r.gstRate, taxableValue: r.taxableValue });
  }
  const b2csCsv = toCsv(
    ["Type", "Place Of Supply", "Rate", "Applicable % of Tax Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
    Array.from(b2csMap.values()).map((row) => ["OE", row.pos, row.rate, "", round2(row.taxableValue), "", ""]),
  );

  // ── cdnr.csv ────────────────────────────────────────────────────────────
  const creditNoteTotals = new Map<string, number>();
  for (const cn of report.creditNotes) {
    creditNoteTotals.set(cn.creditNoteNumber, (creditNoteTotals.get(cn.creditNoteNumber) ?? 0) + cn.total);
  }
  const cdnrMap = new Map<string, { row: CreditNoteRow; rate: number; taxableValue: number; pos: string }>();
  for (const cn of report.creditNotes) {
    if (cn.creditNoteNumber === "—") continue; // no number assigned yet — nothing valid to export
    const invoiceRow = invoiceTotalByNumber.get(cn.invoiceNumber);
    if (!invoiceRow) continue;
    const pos = resolvePos(invoiceRow.placeOfSupply, `credit note ${cn.creditNoteNumber}`);
    if (!pos) continue;
    const key = `${cn.creditNoteNumber}|${cn.gstRate}`;
    const existing = cdnrMap.get(key);
    if (existing) existing.taxableValue += cn.taxableValue;
    else cdnrMap.set(key, { row: cn, rate: cn.gstRate, taxableValue: cn.taxableValue, pos });
  }
  const cdnrCsv = toCsv(
    ["GSTIN/UIN of Recipient", "Receiver Name", "Note Number", "Note Date", "Note Type", "Place Of Supply",
      "Reverse Charge", "Note Supply Type", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
    Array.from(cdnrMap.values()).map(({ row, rate, taxableValue, pos }) => {
      const invoiceRow = invoiceTotalByNumber.get(row.invoiceNumber);
      return [
        row.customerGstin, row.customerName, row.creditNoteNumber, formatGstDate(row.date), "C", pos,
        invoiceRow?.reverseCharge ? "Y" : "N", "Regular B2B",
        round2(creditNoteTotals.get(row.creditNoteNumber) ?? 0), "", rate, round2(taxableValue), "",
      ];
    }),
  );

  // ── hsn(b2b).csv / hsn(b2c).csv ────────────────────────────────────────
  function hsnRows(rows: HsnSummaryRow[]): (string | number)[][] {
    return rows.map((h) => {
      const uqc = mapUnitToUqc(h.unit);
      if (!uqc.matched) {
        issues.push(issue(
          "warning", "GST Filing Export",
          `Unit "${h.unit}" for HSN ${h.hsn} (${h.gstRate}%) doesn't map to a standard GST UQC — exported as "OTH-OTHERS"; review the quantity/unit on the actual portal filing.`,
          h.hsn,
        ));
      }
      return [
        h.hsn, "", uqc.code, h.totalQuantity, round2(h.total), round2(h.taxableValue),
        round2(h.igst), round2(h.cgst), round2(h.sgst), "", h.gstRate,
      ];
    });
  }
  const hsnHeader = ["HSN", "Description", "UQC", "Total Quantity", "Total Value", "Taxable Value",
    "Integrated Tax Amount", "Central Tax Amount", "State/UT Tax Amount", "Cess Amount", "Rate"];
  const hsnB2bCsv = toCsv(hsnHeader, hsnRows(report.hsnSummaryB2B));
  const hsnB2cCsv = toCsv(hsnHeader, hsnRows(report.hsnSummaryB2C));

  return {
    files: [
      { name: "b2b,sez,de.csv", content: b2bCsv },
      { name: "b2cs.csv", content: b2csCsv },
      { name: "cdnr.csv", content: cdnrCsv },
      { name: "hsn(b2b).csv", content: hsnB2bCsv },
      { name: "hsn(b2c).csv", content: hsnB2cCsv },
    ],
    issues,
  };
}
