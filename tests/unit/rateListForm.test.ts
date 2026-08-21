import { describe, it, expect } from "vitest";
import { toNum, calcRateListItem, validateAndBuildRateListItems } from "@/lib/rateListForm";

describe("toNum", () => {
  it("parses a numeric string", () => {
    expect(toNum("42.5")).toBe(42.5);
  });

  it("passes a number through unchanged", () => {
    expect(toNum(7)).toBe(7);
  });

  it("returns 0 for undefined, empty, or non-numeric input", () => {
    expect(toNum(undefined)).toBe(0);
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
  });
});

describe("calcRateListItem", () => {
  it("uses the list rate as-is for a net-rate item, ignoring discount", () => {
    const result = calcRateListItem({ isNetRate: true, discountPercent: "50", listRate: "100" });
    expect(result.amount).toBe(100);
  });

  it("applies a normal discount percentage", () => {
    const result = calcRateListItem({ isNetRate: false, discountPercent: "20", listRate: "100" });
    expect(result.amount).toBe(80);
  });

  it("clamps discount above 100 down to 100 (amount 0)", () => {
    const result = calcRateListItem({ isNetRate: false, discountPercent: "150", listRate: "100" });
    expect(result.amount).toBe(0);
  });

  it("clamps a negative discount up to 0 (no discount applied)", () => {
    const result = calcRateListItem({ isNetRate: false, discountPercent: "-10", listRate: "100" });
    expect(result.amount).toBe(100);
  });

  it("rounds the computed amount to 2 decimal places", () => {
    // 10 - 10*33.333/100 = 6.6667 -> rounds to 6.67, not left at full float precision.
    const result = calcRateListItem({ isNetRate: false, discountPercent: "33.333", listRate: "10" });
    expect(result.amount).toBe(6.67);
  });
});

describe("validateAndBuildRateListItems", () => {
  it("rejects a non-array or empty payload", () => {
    expect(validateAndBuildRateListItems(null)).toEqual({ error: "At least one item is required" });
    expect(validateAndBuildRateListItems([])).toEqual({ error: "At least one item is required" });
  });

  it("rejects an item with no name", () => {
    const result = validateAndBuildRateListItems([{ name: "", unit: "Nos", listRate: 10 }]);
    expect(result).toEqual({ error: "Every item must have a name" });
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = validateAndBuildRateListItems([{ name: "A", unit: "Nos", listRate: 10 }]);
    expect(result).toEqual({ error: "Item name must be at least 2 characters" });
  });

  it("rejects an item with no unit", () => {
    const result = validateAndBuildRateListItems([{ name: "Beaker", unit: "", listRate: 10 }]);
    expect(result).toEqual({ error: "Every item must have a unit" });
  });

  it("rejects a negative list rate", () => {
    const result = validateAndBuildRateListItems([{ name: "Beaker", unit: "Nos", listRate: -5 }]);
    expect(result).toEqual({ error: "Every item's list rate must be 0 or more" });
  });

  it("accepts a list rate of exactly 0", () => {
    const result = validateAndBuildRateListItems([{ name: "Free Sample", unit: "Nos", listRate: 0 }]);
    expect("items" in result).toBe(true);
  });

  it("builds valid items with correct serial numbers and computed amounts", () => {
    const result = validateAndBuildRateListItems([
      { name: "Beaker 250ml", brand: "Borosil", unit: "Nos", listRate: 100, discountPercent: 10 },
      { name: "Flask 500ml", unit: "Nos", listRate: 200, isNetRate: true },
    ]);
    expect("items" in result).toBe(true);
    if ("items" in result) {
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ serialNo: 1, name: "Beaker 250ml", brand: "Borosil", amount: 90 });
      expect(result.items[1]).toMatchObject({ serialNo: 2, name: "Flask 500ml", brand: null, isNetRate: true, amount: 200 });
    }
  });

  it("stops at the first invalid item and reports its error, ignoring later valid ones", () => {
    const result = validateAndBuildRateListItems([
      { name: "Valid Item", unit: "Nos", listRate: 10 },
      { name: "", unit: "Nos", listRate: 10 },
    ]);
    expect(result).toEqual({ error: "Every item must have a name" });
  });
});
