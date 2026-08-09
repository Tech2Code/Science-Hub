import { describe, it, expect } from "vitest";
import { toNum, calcPurchaseBillItem, computePurchaseBillTotals, type PurchaseBillLineItem } from "@/lib/purchaseBillForm";

describe("toNum", () => {
  it("parses a numeric string", () => {
    expect(toNum("12.5")).toBe(12.5);
  });
  it("returns 0 for empty/non-numeric input instead of NaN", () => {
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
  });
});

function makeItem(overrides: Partial<PurchaseBillLineItem> = {}): PurchaseBillLineItem {
  return {
    key: "k", productId: "", name: "Item", hsn: "", unit: "Nos",
    quantity: "1", purchasePrice: "100", gstRate: "18", discountPercent: "0",
    ...overrides,
  };
}

describe("calcPurchaseBillItem", () => {
  it("applies discount before GST, same formula as the sales invoice line calc", () => {
    const { gross, discountAmount, subtotal, gstAmount, total } = calcPurchaseBillItem(
      makeItem({ quantity: "1", purchasePrice: "1000", gstRate: "18", discountPercent: "10" })
    );
    expect(gross).toBe(1000);
    expect(discountAmount).toBe(100);
    expect(subtotal).toBe(900);
    expect(gstAmount).toBeCloseTo(162, 5);
    expect(total).toBeCloseTo(1062, 5);
  });

  it("treats a non-numeric field as 0 rather than throwing", () => {
    const { total } = calcPurchaseBillItem(makeItem({ quantity: "not-a-number" }));
    expect(total).toBe(0);
  });
});

describe("computePurchaseBillTotals", () => {
  it("sums item totals and subtracts a flat bill-level discount before rounding", () => {
    const items = [makeItem({ quantity: "1", purchasePrice: "100", gstRate: "0", discountPercent: "0" })];
    const totals = computePurchaseBillTotals(items, "5");
    expect(totals.subtotal).toBe(100);
    expect(totals.rawTotal).toBe(95);
    expect(totals.grandTotal).toBe(95);
  });

  it("returns zeroed totals for an empty item list with no discount", () => {
    const totals = computePurchaseBillTotals([], "0");
    expect(totals.grossTotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });
});
