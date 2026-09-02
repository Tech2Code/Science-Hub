import { describe, it, expect } from "vitest";
import { buildGstr1CsvFiles } from "@/lib/gstr1CsvExport";
import type { GstFilingReport } from "@/lib/gstFiling";

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
      inputTaxable: 0, inputTax: 0, netGstPayable: 0,
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
          taxableValue: 1000, cgst: 0, sgst: 0, igst: 50, total: 1050 },
        { invoiceNumber: "SH-2", date: new Date("2026-04-06"), customerName: "Walk-in 2", customerGstin: "",
          placeOfSupply: "Haryana", supplyType: "Inter-State", isB2B: false, reverseCharge: false,
          taxableValue: 2000, cgst: 0, sgst: 0, igst: 100, total: 2100 },
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
        taxableValue: 1000, cgst: 0, sgst: 0, igst: 180, total: 1180,
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
