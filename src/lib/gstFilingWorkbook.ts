// Builds the multi-sheet GST filing workbook (server-side, Node ExcelJS) —
// one sheet per report, using accountant-friendly column names.
import ExcelJS from "exceljs";
import type { GstFilingReport } from "@/lib/gstFiling";

const money = (n: number) => Math.round(n * 100) / 100;
const dateStr = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function addTable(wb: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[], rows: Record<string, unknown>[]) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  return sheet;
}

export function buildGstFilingWorkbook(report: GstFilingReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Science Hub";

  // Company Info
  const infoSheet = wb.addWorksheet("Company Info");
  infoSheet.columns = [{ header: "Field", key: "field", width: 28 }, { header: "Value", key: "value", width: 40 }];
  infoSheet.getRow(1).font = { bold: true };
  [
    ["Business Name", report.company.name],
    ["GSTIN", report.company.gstin || "(not set)"],
    ["PAN", report.company.pan || "(not set)"],
    ["State", report.company.state || "(not set)"],
    ["Address", report.company.address || "(not set)"],
    ["Return Period", report.period.label],
  ].forEach(([field, value]) => infoSheet.addRow({ field, value }));

  // Sales Register
  const salesCols: Partial<ExcelJS.Column>[] = [
    { header: "Invoice No.", key: "invoiceNumber", width: 16 },
    { header: "Date", key: "date", width: 14 },
    { header: "Customer", key: "customerName", width: 24 },
    { header: "Customer GSTIN", key: "customerGstin", width: 18 },
    { header: "Place of Supply", key: "placeOfSupply", width: 16 },
    { header: "Supply Type", key: "supplyType", width: 14 },
    { header: "Taxable Value", key: "taxableValue", width: 16 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
    { header: "IGST", key: "igst", width: 12 },
    { header: "Total", key: "total", width: 14 },
  ];
  const toSalesRow = (r: GstFilingReport["salesRegister"][number]) => ({
    invoiceNumber: r.invoiceNumber, date: dateStr(r.date), customerName: r.customerName, customerGstin: r.customerGstin,
    placeOfSupply: r.placeOfSupply, supplyType: r.supplyType, taxableValue: money(r.taxableValue),
    cgst: money(r.cgst), sgst: money(r.sgst), igst: money(r.igst), total: money(r.total),
  });
  addTable(wb, "Sales Register", salesCols, report.salesRegister.map(toSalesRow));
  addTable(wb, "B2B Sales", salesCols, report.b2bSales.map(toSalesRow));
  addTable(wb, "B2C Sales", salesCols, report.b2cSales.map(toSalesRow));

  // Credit Notes
  addTable(wb, "Credit Notes",
    [
      { header: "Credit Note No.", key: "creditNoteNumber", width: 18 },
      { header: "Date", key: "date", width: 14 },
      { header: "Original Invoice No.", key: "invoiceNumber", width: 18 },
      { header: "Customer", key: "customerName", width: 24 },
      { header: "Customer GSTIN", key: "customerGstin", width: 18 },
      { header: "Product", key: "productName", width: 24 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Taxable Value", key: "taxableValue", width: 16 },
      { header: "GST Rate %", key: "gstRate", width: 12 },
      { header: "CGST", key: "cgst", width: 12 },
      { header: "SGST", key: "sgst", width: 12 },
      { header: "IGST", key: "igst", width: 12 },
      { header: "Total", key: "total", width: 14 },
    ],
    report.creditNotes.map((r) => ({
      creditNoteNumber: r.creditNoteNumber,
      date: dateStr(r.date), invoiceNumber: r.invoiceNumber, customerName: r.customerName, customerGstin: r.customerGstin,
      productName: r.productName, quantity: r.quantity, taxableValue: money(r.taxableValue), gstRate: r.gstRate,
      cgst: money(r.cgst), sgst: money(r.sgst), igst: money(r.igst), total: money(r.total),
    }))
  );

  // Purchase Register
  addTable(wb, "Purchase Register",
    [
      { header: "Bill No.", key: "billNumber", width: 16 },
      { header: "Date", key: "date", width: 14 },
      { header: "Vendor", key: "vendorName", width: 24 },
      { header: "Vendor GSTIN", key: "vendorGstin", width: 18 },
      { header: "Taxable Value", key: "taxableValue", width: 16 },
      { header: "GST (ITC)", key: "taxAmount", width: 14 },
      { header: "Total", key: "total", width: 14 },
    ],
    report.purchaseRegister.map((r) => ({
      billNumber: r.billNumber, date: dateStr(r.date), vendorName: r.vendorName, vendorGstin: r.vendorGstin,
      taxableValue: money(r.taxableValue), taxAmount: money(r.taxAmount), total: money(r.total),
    }))
  );

  // HSN Summary
  addTable(wb, "HSN Summary",
    [
      { header: "HSN Code", key: "hsn", width: 14 },
      { header: "GST Rate %", key: "gstRate", width: 12 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Total Quantity", key: "totalQuantity", width: 14 },
      { header: "Taxable Value", key: "taxableValue", width: 16 },
      { header: "CGST", key: "cgst", width: 12 },
      { header: "SGST", key: "sgst", width: 12 },
      { header: "IGST", key: "igst", width: 12 },
      { header: "Total", key: "total", width: 14 },
    ],
    report.hsnSummary.map((r) => ({
      hsn: r.hsn, gstRate: r.gstRate, unit: r.unit, totalQuantity: r.totalQuantity, taxableValue: money(r.taxableValue),
      cgst: money(r.cgst), sgst: money(r.sgst), igst: money(r.igst), total: money(r.total),
    }))
  );

  // GST Summary
  const s = report.summary;
  addTable(wb, "GST Summary",
    [{ header: "Particulars", key: "label", width: 40 }, { header: "Amount (₹)", key: "value", width: 18 }],
    [
      { label: "Return Period", value: report.period.label },
      { label: "Output Taxable Value (Sales)", value: money(s.outputTaxable) },
      { label: "Output CGST", value: money(s.outputCgst) },
      { label: "Output SGST", value: money(s.outputSgst) },
      { label: "Output IGST", value: money(s.outputIgst) },
      { label: "Total Output Tax", value: money(s.outputTax) },
      { label: "Less: Credit Note Taxable Value", value: money(s.creditNoteTaxable) },
      { label: "Less: Credit Note Tax", value: money(s.creditNoteTax) },
      { label: "Net Output Tax", value: money(s.netOutputTax) },
      { label: "Input Taxable Value (Purchases)", value: money(s.inputTaxable) },
      { label: "Input Tax Credit (ITC)", value: money(s.inputTax) },
      { label: "Net GST Payable (Net Output Tax − ITC)", value: money(s.netGstPayable) },
    ]
  );
  const gstSummarySheet = wb.getWorksheet("GST Summary");
  if (gstSummarySheet) gstSummarySheet.getRow(13).font = { bold: true };

  return wb;
}
