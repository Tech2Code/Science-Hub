import { describe, it, expect } from "vitest";
import { lineBreakdown, computeInvoiceTotals, type InvoiceLineItem } from "@/lib/invoiceCalc";

describe("lineBreakdown", () => {
  it("computes taxable value and GST with no discount", () => {
    const b = lineBreakdown({ qty: 2, price: 100, gstRate: 18, discountPercent: 0 });
    expect(b.gross).toBe(200);
    expect(b.discountAmount).toBe(0);
    expect(b.taxable).toBe(200);
    expect(b.gstAmt).toBeCloseTo(36, 5);
    expect(b.total).toBeCloseTo(236, 5);
  });

  it("applies discount before computing GST", () => {
    const b = lineBreakdown({ qty: 1, price: 1000, gstRate: 18, discountPercent: 10 });
    expect(b.gross).toBe(1000);
    expect(b.discountAmount).toBe(100);
    expect(b.taxable).toBe(900);
    expect(b.gstAmt).toBeCloseTo(162, 5); // 18% of 900, not of 1000
    expect(b.total).toBeCloseTo(1062, 5);
  });

  it("handles a 100% discount (fully discounted line has zero tax)", () => {
    const b = lineBreakdown({ qty: 1, price: 500, gstRate: 18, discountPercent: 100 });
    expect(b.taxable).toBe(0);
    expect(b.gstAmt).toBe(0);
    expect(b.total).toBe(0);
  });

  it("handles a fractional discount percent (e.g. from a legacy flat-amount-derived value)", () => {
    const b = lineBreakdown({ qty: 3, price: 100, gstRate: 5, discountPercent: 33.333333 });
    expect(b.taxable).toBeCloseTo(200.0000, 2);
  });
});

function makeItem(overrides: Partial<InvoiceLineItem>): InvoiceLineItem {
  return {
    key: "k", productId: "", productName: "Item", unit: "Nos",
    qty: 1, price: 100, gstRate: 18, hsn: "", discountPercent: 0,
    ...overrides,
  };
}

describe("computeInvoiceTotals", () => {
  it("sums multiple lines and groups tax by GST rate", () => {
    const items = [
      makeItem({ qty: 1, price: 100, gstRate: 18 }),
      makeItem({ qty: 1, price: 100, gstRate: 5 }),
    ];
    const totals = computeInvoiceTotals(items);
    expect(totals.subtotal).toBe(200);
    expect(totals.taxBreakdown[18]).toBeCloseTo(18, 5);
    expect(totals.taxBreakdown[5]).toBeCloseTo(5, 5);
    expect(totals.totalTax).toBeCloseTo(23, 5);
  });

  it("rounds the grand total to the nearest rupee and reports the round-off delta", () => {
    // 100 taxable + 18% GST = 118.00 exactly -> no rounding needed here;
    // use a rate that produces a fractional total instead.
    const items = [makeItem({ qty: 1, price: 100.4, gstRate: 0 })];
    const totals = computeInvoiceTotals(items);
    expect(totals.grandTotal).toBe(100);
    expect(totals.roundOff).toBeCloseTo(-0.4, 5);
  });

  it("returns zeroed totals for an empty item list", () => {
    const totals = computeInvoiceTotals([]);
    expect(totals.grossTotal).toBe(0);
    expect(totals.subtotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });
});
