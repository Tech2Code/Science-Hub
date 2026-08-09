import { describe, it, expect } from "vitest";
import { isOutOfStock, isLowStock, needsRestock } from "@/lib/stockStatus";

describe("stockStatus", () => {
  it("treats zero and negative stock as out of stock", () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-1)).toBe(true);
    expect(isOutOfStock(1)).toBe(false);
  });

  it("treats stock between 1 and minStock (inclusive) as low, but not zero", () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(1, 5)).toBe(true);
    expect(isLowStock(0, 5)).toBe(false); // out of stock, not "low"
    expect(isLowStock(6, 5)).toBe(false);
  });

  it("out-of-stock and low-stock are mutually exclusive for every stock level 0..minStock+1", () => {
    const minStock = 5;
    for (let stock = 0; stock <= minStock + 1; stock++) {
      expect(isOutOfStock(stock) && isLowStock(stock, minStock)).toBe(false);
    }
  });

  it("needsRestock is true whenever either out-of-stock or low-stock is true", () => {
    expect(needsRestock(0, 5)).toBe(true);
    expect(needsRestock(3, 5)).toBe(true);
    expect(needsRestock(10, 5)).toBe(false);
  });
});
