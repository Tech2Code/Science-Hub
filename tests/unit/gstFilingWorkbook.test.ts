import { describe, it, expect } from "vitest";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";
import { computeRoundOff } from "@/lib/roundOff";
import type { GstFilingReport, SalesRegisterRow } from "@/lib/gstFiling";

function salesRow(overrides: Partial<SalesRegisterRow> = {}): SalesRegisterRow {
  // Odd-paisa intra-state invoice: items 1000.05 taxable @18% = 180.009 tax (90.0045 per half);
  // transport 200 @18% = 36. Total is what the invoice routes store via computeRoundOff().
  const taxableValue = 1000.05, tax = 180.009, transportCharge = 200, transportGst = 36;
  const { roundedTotal } = computeRoundOff(taxableValue + tax + transportCharge + transportGst);
  return {
    invoiceNumber: "SH-2026-27-0001", date: new Date("2026-05-02T06:00:00Z"), customerName: "Acme",
    customerGstin: "07AAAAA1111A1Z5", placeOfSupply: "Delhi", supplyType: "Intra-State", isB2B: true, reverseCharge: false,
    taxableValue, cgst: tax / 2, sgst: tax / 2, igst: 0, transportCharge, transportGst, total: roundedTotal,
    ...overrides,
  };
}

function report(rows: SalesRegisterRow[]): GstFilingReport {
  return {
    period: { startDate: "2026-05-01", endDate: "2026-05-31", label: "May 2026" },
    company: { name: "Test Co", gstin: "07AAAAA0000A1Z5", pan: "AAAAA0000A", state: "Delhi", address: "", gstinValid: true },
    salesRegister: rows, salesRegisterByRate: [], b2bSales: rows.filter((r) => r.isB2B), b2cSales: rows.filter((r) => !r.isB2B),
    creditNotes: [], purchaseRegister: [], hsnSummary: [], hsnSummaryB2B: [], hsnSummaryB2C: [],
    summary: {
      outputTaxable: 0, outputCgst: 0, outputSgst: 0, outputIgst: 0, outputTax: 0,
      creditNoteTaxable: 0, creditNoteTax: 0, netOutputTax: 0,
      inputTaxable: 0, inputTax: 0, ineligibleInputTaxable: 0, ineligibleInputTax: 0,
      rawNetGstPayable: 0, netGstPayableRoundOff: 0, netGstPayable: 0,
    },
    validation: { issues: [], errorCount: 0, warningCount: 0 },
  };
}

const paise = (v: unknown) => Math.round(Number(v) * 100);

describe("buildGstFilingWorkbook — Sales Register", () => {
  it("adds Transport Charge / Transport GST / Round Off columns before Total and every row foots exactly", () => {
    const wb = buildGstFilingWorkbook(report([
      salesRow(),
      salesRow({
        invoiceNumber: "SH-2026-27-0002", customerGstin: "", isB2B: false, supplyType: "Inter-State",
        taxableValue: 1000, cgst: 0, sgst: 0, igst: 180, transportCharge: 0, transportGst: 0, total: 1180,
      }),
    ]));
    for (const name of ["Sales Register", "B2B Sales", "B2C Sales"]) {
      const sheet = wb.getWorksheet(name)!;
      const headers = (sheet.getRow(1).values as unknown[]).slice(1);
      const idx = (h: string) => headers.indexOf(h);
      expect(idx("Transport Charge")).toBe(idx("IGST") + 1);
      expect(idx("Transport GST")).toBe(idx("Transport Charge") + 1);
      expect(idx("Round Off")).toBe(idx("Transport GST") + 1);
      expect(idx("Total")).toBe(idx("Round Off") + 1);

      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cell = (k: string) => row.getCell(k).value;
        const sum = ["taxableValue", "cgst", "sgst", "igst", "transportCharge", "transportGst", "roundOff"]
          .reduce((s, k) => s + paise(cell(k)), 0);
        expect(sum).toBe(paise(cell("total"))); // exact, in integer paise
      }
    }
    const first = wb.getWorksheet("Sales Register")!.getRow(2);
    expect(first.getCell("cgst").value).toBe(90.01); // splitGstForDisplay: 180.01 → 90.01 + 90.00
    expect(first.getCell("sgst").value).toBe(90);
    expect(first.getCell("transportCharge").value).toBe(200);
    expect(first.getCell("transportGst").value).toBe(36);
    expect(first.getCell("roundOff").value).toBe(-0.06); // matches the invoice's own stored round-off
    expect(first.getCell("total").value).toBe(1416);
    expect(wb.getWorksheet("Sales Register")!.getRow(3).getCell("roundOff").value).toBe(0);
  });
});
