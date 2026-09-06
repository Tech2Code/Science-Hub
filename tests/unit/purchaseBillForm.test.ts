import { describe, it, expect } from "vitest";
import {
  toNum, calcPurchaseBillItem, computePurchaseBillTotals,
  computeQuickAddNetRate, computeQuickAddTaxInclusivePrice,
  resolvePurchaseBillLineRate, resolveQuickAddLineRate,
  type PurchaseBillLineItem, type PurchaseBillProduct,
} from "@/lib/purchaseBillForm";

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

describe("computeQuickAddNetRate", () => {
  it("applies discount % to list price", () => {
    expect(computeQuickAddNetRate("100", "20")).toBe(80);
  });
  it("returns 0 for a blank/zero/negative list price", () => {
    expect(computeQuickAddNetRate("", "10")).toBe(0);
    expect(computeQuickAddNetRate("0", "10")).toBe(0);
  });
  it("clamps discount to [0,100]", () => {
    expect(computeQuickAddNetRate("100", "150")).toBe(0);
    expect(computeQuickAddNetRate("100", "-10")).toBe(100);
  });
});

describe("computeQuickAddTaxInclusivePrice", () => {
  it("adds GST on top of the net rate", () => {
    expect(computeQuickAddTaxInclusivePrice(100, "18")).toBe(118);
  });
  it("treats a negative GST rate as 0", () => {
    expect(computeQuickAddTaxInclusivePrice(100, "-5")).toBe(100);
  });
});

function makeProduct(overrides: Partial<PurchaseBillProduct> = {}): PurchaseBillProduct {
  return {
    id: "p1", name: "Beaker", sku: null, unit: "Nos", price: 100,
    purchasePrice: null, listPrice: null, discountPercent: null, gstRate: 18, hsn: null,
    ...overrides,
  };
}

describe("resolvePurchaseBillLineRate", () => {
  it("uses listPrice + discount when purchasePrice still agrees with the formula", () => {
    const { rate, discountPercent } = resolvePurchaseBillLineRate(
      makeProduct({ listPrice: 100, discountPercent: 20, purchasePrice: 80 })
    );
    expect(rate).toBe(100);
    expect(discountPercent).toBe("20");
  });

  it("trusts a manually-overridden purchasePrice over a stale listPrice/discount, with 0 further discount", () => {
    // listPrice=100, discount=20 => computed net would be 80, but purchasePrice was hand-edited to 70.
    const { rate, discountPercent } = resolvePurchaseBillLineRate(
      makeProduct({ listPrice: 100, discountPercent: 20, purchasePrice: 70 })
    );
    expect(rate).toBe(70);
    expect(discountPercent).toBe("0");
  });

  it("falls back to purchasePrice (0 discount) for a legacy product with no listPrice", () => {
    const { rate, discountPercent } = resolvePurchaseBillLineRate(makeProduct({ purchasePrice: 90 }));
    expect(rate).toBe(90);
    expect(discountPercent).toBe("0");
  });

  it("falls back to selling price when neither listPrice nor purchasePrice is set", () => {
    const { rate, discountPercent } = resolvePurchaseBillLineRate(makeProduct({ price: 50 }));
    expect(rate).toBe(50);
    expect(discountPercent).toBe("0");
  });
});

describe("resolveQuickAddLineRate", () => {
  it("uses listPrice + discount when purchasePrice still agrees with the computed net rate", () => {
    const { rate, discountPercent } = resolveQuickAddLineRate("100", "20", "80");
    expect(rate).toBe("100");
    expect(discountPercent).toBe("20");
  });

  it("trusts a manually-overridden purchasePrice, with 0 further discount", () => {
    const { rate, discountPercent } = resolveQuickAddLineRate("100", "20", "70");
    expect(rate).toBe("70");
    expect(discountPercent).toBe("0");
  });

  it("uses purchasePrice directly when no listPrice was entered at all", () => {
    const { rate, discountPercent } = resolveQuickAddLineRate("", "0", "55");
    expect(rate).toBe("55");
    expect(discountPercent).toBe("0");
  });
});
