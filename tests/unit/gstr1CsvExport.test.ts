import { describe, it, expect } from "vitest";
import { buildGstr1CsvFiles } from "@/lib/gstr1CsvExport";
import { isCreditNoteFileable, type GstFilingReport, type CreditNoteRow, type SalesRateRow } from "@/lib/gstFiling";

function baseReport(overrides: Partial<GstFilingReport> = {}): GstFilingReport {
  return {
    period: { startDate: "2026-04-01", endDate: "2026-04-30", label: "Apr 2026" },
    company: { name: "Test Co", gstin: "07AAAAA0000A1Z5", pan: "AAAAA0000A", state: "Delhi", address: "", gstinValid: true },
    salesRegister: [],
    salesRegisterByRate: [],
    b2bSales: [],
    b2cSales: [],
    creditNotes: [],
    purchaseRegister: [],
    hsnSummary: [],
    hsnSummaryB2B: [],
    hsnSummaryB2C: [],
    summary: {
      outputTaxable: 0, outputCgst: 0, outputSgst: 0, outputIgst: 0, outputTax: 0,
      creditNoteTaxable: 0, creditNoteTax: 0, netOutputTax: 0,
      inputTaxable: 0, inputTax: 0, ineligibleInputTaxable: 0, ineligibleInputTax: 0, rawNetGstPayable: 0, netGstPayableRoundOff: 0, netGstPayable: 0,
    },
    validation: { issues: [], errorCount: 0, warningCount: 0 },
    ...overrides,
  };
}

describe("buildGstr1CsvFiles", () => {
  it("splits a single mixed-rate invoice into two b2b rows, one per rate", () => {
    const report = baseReport({
      salesRegister: [{
        invoiceNumber: "SH-2026-27-0001", date: new Date("2026-04-10"), customerName: "Acme Pvt Ltd",
        customerGstin: "07AAAAA1111A1Z5", placeOfSupply: "Delhi", supplyType: "Intra-State", isB2B: true,
        reverseCharge: false, taxableValue: 15000, cgst: 900, sgst: 900, igst: 0, total: 16800,
        transportCharge: 0, transportGst: 0,
      }],
      salesRegisterByRate: [
        {
          invoiceNumber: "SH-2026-27-0001", date: new Date("2026-04-10"), customerName: "Acme Pvt Ltd",
          customerGstin: "07AAAAA1111A1Z5", placeOfSupply: "Delhi", supplyType: "Intra-State", isB2B: true,
          reverseCharge: false, gstRate: 12, taxableValue: 10000, cgst: 600, sgst: 600, igst: 0, total: 11200,
        },
        {
          invoiceNumber: "SH-2026-27-0001", date: new Date("2026-04-10"), customerName: "Acme Pvt Ltd",
          customerGstin: "07AAAAA1111A1Z5", placeOfSupply: "Delhi", supplyType: "Intra-State", isB2B: true,
          reverseCharge: false, gstRate: 18, taxableValue: 5000, cgst: 300, sgst: 300, igst: 0, total: 5600,
        },
      ],
    });

    const { files, issues } = buildGstr1CsvFiles(report);
    const b2b = files.find((f) => f.name === "b2b,sez,de.csv")!.content;
    const lines = b2b.trim().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rate rows
    expect(lines[1]).toContain("07AAAAA1111A1Z5,Acme Pvt Ltd,SH-2026-27-0001,10-Apr-2026,16800,07-Delhi,N,,Regular B2B,,12,10000,");
    expect(lines[2]).toContain("18,5000,");
    expect(issues).toHaveLength(0);
  });

  it("aggregates B2C rows by place of supply + rate instead of per invoice", () => {
    const report = baseReport({
      salesRegister: [
        { invoiceNumber: "SH-1", date: new Date("2026-04-05"), customerName: "Walk-in", customerGstin: "",
          placeOfSupply: "Haryana", supplyType: "Inter-State", isB2B: false, reverseCharge: false,
          taxableValue: 1000, cgst: 0, sgst: 0, igst: 50, total: 1050, transportCharge: 0, transportGst: 0 },
        { invoiceNumber: "SH-2", date: new Date("2026-04-06"), customerName: "Walk-in 2", customerGstin: "",
          placeOfSupply: "Haryana", supplyType: "Inter-State", isB2B: false, reverseCharge: false,
          taxableValue: 2000, cgst: 0, sgst: 0, igst: 100, total: 2100, transportCharge: 0, transportGst: 0 },
      ],
      salesRegisterByRate: [
        { invoiceNumber: "SH-1", date: new Date("2026-04-05"), customerName: "Walk-in", customerGstin: "",
          placeOfSupply: "Haryana", supplyType: "Inter-State", isB2B: false, reverseCharge: false,
          gstRate: 5, taxableValue: 1000, cgst: 0, sgst: 0, igst: 50, total: 1050 },
        { invoiceNumber: "SH-2", date: new Date("2026-04-06"), customerName: "Walk-in 2", customerGstin: "",
          placeOfSupply: "Haryana", supplyType: "Inter-State", isB2B: false, reverseCharge: false,
          gstRate: 5, taxableValue: 2000, cgst: 0, sgst: 0, igst: 100, total: 2100 },
      ],
    });

    const { files } = buildGstr1CsvFiles(report);
    const b2cs = files.find((f) => f.name === "b2cs.csv")!.content;
    const lines = b2cs.trim().split("\r\n");
    expect(lines).toHaveLength(2); // header + one aggregated row (same POS + rate)
    expect(lines[1]).toBe("OE,06-Haryana,5,,3000,,");
  });

  it("flags and drops rows with an unrecognized place of supply instead of exporting a bad row", () => {
    const report = baseReport({
      salesRegister: [{
        invoiceNumber: "SH-9", date: new Date("2026-04-01"), customerName: "Foo", customerGstin: "07AAAAA0000A1Z5",
        placeOfSupply: "Narnia", supplyType: "Inter-State", isB2B: true, reverseCharge: false,
        taxableValue: 1000, cgst: 0, sgst: 0, igst: 180, total: 1180, transportCharge: 0, transportGst: 0,
      }],
      salesRegisterByRate: [{
        invoiceNumber: "SH-9", date: new Date("2026-04-01"), customerName: "Foo", customerGstin: "07AAAAA0000A1Z5",
        placeOfSupply: "Narnia", supplyType: "Inter-State", isB2B: true, reverseCharge: false,
        gstRate: 18, taxableValue: 1000, cgst: 0, sgst: 0, igst: 180, total: 1180,
      }],
    });

    const { files, issues } = buildGstr1CsvFiles(report);
    const b2b = files.find((f) => f.name === "b2b,sez,de.csv")!.content;
    expect(b2b.trim().split("\r\n")).toHaveLength(1); // header only, row dropped
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("Narnia");
  });

  it("maps a known unit to its GST UQC code and falls back to OTH-OTHERS with a warning for an unknown one", () => {
    const report = baseReport({
      hsnSummaryB2B: [
        { hsn: "3401", gstRate: 18, unit: "Nos", totalQuantity: 10, taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180 },
        { hsn: "9999", gstRate: 18, unit: "Barrel", totalQuantity: 5, taxableValue: 500, cgst: 45, sgst: 45, igst: 0, total: 590 },
      ],
    });

    const { files, issues } = buildGstr1CsvFiles(report);
    const hsn = files.find((f) => f.name === "hsn(b2b).csv")!.content;
    const lines = hsn.trim().split("\r\n");
    expect(lines[1]).toBe("3401,,NOS-NUMBERS,10,1180,1000,0,90,90,,18");
    expect(lines[2]).toBe("9999,,OTH-OTHERS,5,590,500,0,45,45,,18");
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("Barrel"))).toBe(true);
  });
});

function creditNote(overrides: Partial<CreditNoteRow> = {}): CreditNoteRow {
  return {
    returnId: "r1", creditNoteNumber: "CN-2026-27-0001", date: new Date("2026-05-10T06:00:00Z"),
    invoiceNumber: "SH-2026-27-0001", customerName: "Acme Pvt Ltd", customerGstin: "07AAAAA1111A1Z5",
    productName: "Widget", quantity: 1, taxableValue: 1000, gstRate: 18,
    cgst: 90, sgst: 90, igst: 0, total: 1180,
    placeOfSupply: "Delhi", reverseCharge: false, invoiceDate: new Date("2026-04-10T06:00:00Z"), invoiceTotal: 5900,
    ...overrides,
  };
}

function b2cRate(overrides: Partial<SalesRateRow> = {}): SalesRateRow {
  return {
    invoiceNumber: "SH-B2C-1", date: new Date("2026-05-02T06:00:00Z"), customerName: "Walk-in", customerGstin: "",
    placeOfSupply: "Delhi", supplyType: "Intra-State", isB2B: false, reverseCharge: false,
    gstRate: 18, taxableValue: 5000, cgst: 450, sgst: 450, igst: 0, total: 5900,
    ...overrides,
  };
}

describe("buildGstr1CsvFiles — cdnr.csv", () => {
  it("exports a credit note whose original invoice is dated in an earlier period (not in this period's Sales Register)", () => {
    // salesRegister is empty: the invoice was dated in April, the credit note in May.
    const report = baseReport({ creditNotes: [creditNote({ reverseCharge: true })] });
    const { files, issues } = buildGstr1CsvFiles(report);
    const lines = files.find((f) => f.name === "cdnr.csv")!.content.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("07AAAAA1111A1Z5,Acme Pvt Ltd,CN-2026-27-0001,10-May-2026,C,07-Delhi,Y,Regular B2B,1180,,18,1000,");
    expect(issues).toHaveLength(0);
  });

  it("drops a credit note whose own place of supply doesn't resolve, with an error", () => {
    const report = baseReport({ creditNotes: [creditNote({ placeOfSupply: "Narnia" })] });
    const { files, issues } = buildGstr1CsvFiles(report);
    expect(files.find((f) => f.name === "cdnr.csv")!.content.trim().split("\r\n")).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("Narnia");
  });

  it("keeps a credit note to a registered (GSTIN) customer in cdnr.csv and does not touch b2cs.csv", () => {
    const report = baseReport({
      salesRegisterByRate: [b2cRate({ placeOfSupply: "Delhi", gstRate: 18, taxableValue: 5000 })],
      creditNotes: [creditNote()],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    const cdnr = files.find((f) => f.name === "cdnr.csv")!.content.trim().split("\r\n");
    expect(cdnr).toHaveLength(2);
    expect(cdnr[1]).toContain("07AAAAA1111A1Z5,Acme Pvt Ltd,CN-2026-27-0001");
    const b2cs = files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n");
    expect(b2cs[1]).toBe("OE,07-Delhi,18,,5000,,");
    expect(issues).toHaveLength(0);
  });

  it("nets a B2C (no-GSTIN) credit note against the matching b2cs row and leaves it out of cdnr.csv", () => {
    const report = baseReport({
      salesRegisterByRate: [
        b2cRate({ placeOfSupply: "Delhi", gstRate: 18, taxableValue: 5000 }),
        b2cRate({ invoiceNumber: "SH-B2C-2", placeOfSupply: "Delhi", gstRate: 5, taxableValue: 700 }),
      ],
      creditNotes: [creditNote({ customerGstin: "", customerName: "Walk-in", taxableValue: 1000, gstRate: 18 })],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    const cdnr = files.find((f) => f.name === "cdnr.csv")!.content.trim().split("\r\n");
    expect(cdnr).toHaveLength(1); // header only
    const b2cs = files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n");
    expect(b2cs).toHaveLength(3);
    expect(b2cs).toContain("OE,07-Delhi,18,,4000,,");
    expect(b2cs).toContain("OE,07-Delhi,5,,700,,"); // different rate — untouched
    const summary = issues.filter((i) => i.message.includes("netted"));
    expect(summary).toHaveLength(1);
    expect(summary[0].message).toContain("1 credit note");
    expect(summary[0].message).toContain("CN-2026-27-0001");
    expect(issues.some((i) => i.message.includes("exceed"))).toBe(false);
  });

  it("never emits a negative b2cs row — unabsorbed B2C credit notes become an error instead", () => {
    const report = baseReport({
      salesRegisterByRate: [b2cRate({ placeOfSupply: "Delhi", gstRate: 5, taxableValue: 700 })],
      creditNotes: [
        creditNote({ customerGstin: "", placeOfSupply: "Haryana", taxableValue: 600, gstRate: 12 }),
        // second line of the same credit note — counted once in the summary
        creditNote({ customerGstin: "", placeOfSupply: "Haryana", taxableValue: 400, gstRate: 12 }),
      ],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    const b2cs = files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n");
    expect(b2cs).toHaveLength(2); // header + Delhi only — no Haryana row
    expect(b2cs).toContain("OE,07-Delhi,5,,700,,");
    expect(b2cs.some((l) => l.includes(",-"))).toBe(false); // no negative value in any row
    expect(files.find((f) => f.name === "cdnr.csv")!.content.trim().split("\r\n")).toHaveLength(1);
    expect(issues.find((i) => i.message.includes("netted"))!.message).toContain("1 credit note");
    const err = issues.filter((i) => i.severity === "error" && i.message.includes("exceed"));
    expect(err).toHaveLength(1);
    expect(err[0].message).toContain("06-Haryana");
    expect(err[0].message).toContain("₹1000.00");
  });

  it("partly absorbed B2C credit note: no row, error carries only the excess", () => {
    const report = baseReport({
      salesRegisterByRate: [b2cRate({ placeOfSupply: "Delhi", gstRate: 18, taxableValue: 300 })],
      creditNotes: [creditNote({ customerGstin: "", placeOfSupply: "Delhi", taxableValue: 1000, gstRate: 18 })],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    const b2cs = files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n");
    expect(b2cs).toHaveLength(1); // header only
    const err = issues.find((i) => i.severity === "error" && i.message.includes("exceed"))!;
    expect(err.message).toContain("₹700.00");
  });

  it("exactly offset B2C credit note: row dropped, no error", () => {
    const report = baseReport({
      salesRegisterByRate: [b2cRate({ placeOfSupply: "Delhi", gstRate: 18, taxableValue: 1000 })],
      creditNotes: [creditNote({ customerGstin: "", placeOfSupply: "Delhi", taxableValue: 1000, gstRate: 18 })],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    expect(files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n")).toHaveLength(1);
    expect(issues.some((i) => i.message.includes("exceed"))).toBe(false);
  });

  it("drops a B2C credit note with an unresolvable place of supply from b2cs, with an error", () => {
    const report = baseReport({
      creditNotes: [creditNote({ customerGstin: "", placeOfSupply: "Narnia" })],
    });
    const { files, issues } = buildGstr1CsvFiles(report);
    expect(files.find((f) => f.name === "b2cs.csv")!.content.trim().split("\r\n")).toHaveLength(1);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("Narnia"))).toBe(true);
    expect(issues.some((i) => i.message.includes("netted"))).toBe(false);
  });

  it("isCreditNoteFileable mirrors the CSV's own exclusion rules", () => {
    expect(isCreditNoteFileable(creditNote())).toBe(true);
    expect(isCreditNoteFileable(creditNote({ placeOfSupply: "Narnia" }))).toBe(false);
    expect(isCreditNoteFileable(creditNote({ placeOfSupply: "" }))).toBe(false);
    expect(isCreditNoteFileable(creditNote({ creditNoteNumber: "—" }))).toBe(false);
  });
});
