import { describe, it, expect } from "vitest";
import { validateProductForm, hasProductFieldErrors, resolveSellingPrice, type ProductFormData } from "@/lib/productForm";

function makeForm(overrides: Partial<ProductFormData> = {}): ProductFormData {
  return {
    name: "Beaker", sku: "", hsn: "", description: "", unit: "Nos",
    listPrice: "100", discountPercent: "",
    price: "100", purchasePrice: "80", gstRate: "18", stock: "0", minStock: "5",
    brandId: "", categoryId: "",
    ...overrides,
  };
}

describe("validateProductForm — gstRate", () => {
  it("accepts a fractional GST rate (e.g. 0.25% for precious stones/gold)", () => {
    const errors = validateProductForm(makeForm({ gstRate: "0.25" }));
    expect(errors.gstRate).toBeUndefined();
  });

  it("rejects a GST rate over 100", () => {
    const errors = validateProductForm(makeForm({ gstRate: "150" }));
    expect(errors.gstRate).toMatch(/between 0 and 100/i);
  });

  it("rejects an empty GST rate as required", () => {
    const errors = validateProductForm(makeForm({ gstRate: "" }));
    expect(errors.gstRate).toMatch(/required/i);
  });

  it("accepts 0 and 100 as boundary values", () => {
    expect(validateProductForm(makeForm({ gstRate: "0" })).gstRate).toBeUndefined();
    expect(validateProductForm(makeForm({ gstRate: "100" })).gstRate).toBeUndefined();
  });
});

describe("hasProductFieldErrors", () => {
  it("is false for a fully valid form", () => {
    expect(hasProductFieldErrors(validateProductForm(makeForm()))).toBe(false);
  });

  it("is true when any field fails", () => {
    expect(hasProductFieldErrors(validateProductForm(makeForm({ gstRate: "150" })))).toBe(true);
  });
});

describe("validateProductForm — purchasePrice (mandatory)", () => {
  it("rejects a blank purchasePrice", () => {
    const errors = validateProductForm(makeForm({ purchasePrice: "" }));
    expect(errors.purchasePrice).toMatch(/required/i);
  });

  it("rejects a negative purchasePrice", () => {
    const errors = validateProductForm(makeForm({ purchasePrice: "-1" }));
    expect(errors.purchasePrice).toBeDefined();
  });

  it("accepts 0 as a valid purchasePrice", () => {
    const errors = validateProductForm(makeForm({ purchasePrice: "0" }));
    expect(errors.purchasePrice).toBeUndefined();
  });

  it("accepts a valid positive purchasePrice", () => {
    const errors = validateProductForm(makeForm({ purchasePrice: "80" }));
    expect(errors.purchasePrice).toBeUndefined();
  });
});

describe("validateProductForm — listPrice/discountPercent", () => {
  it("rejects a blank listPrice by default (now mandatory)", () => {
    const errors = validateProductForm(makeForm({ listPrice: "" }));
    expect(errors.listPrice).toMatch(/required/i);
  });

  it("accepts a blank discountPercent (still optional)", () => {
    const errors = validateProductForm(makeForm({ discountPercent: "" }));
    expect(errors.discountPercent).toBeUndefined();
  });

  it("accepts a blank listPrice when listPriceRequired is explicitly false (bulk import)", () => {
    const errors = validateProductForm(makeForm({ listPrice: "" }), { listPriceRequired: false });
    expect(errors.listPrice).toBeUndefined();
  });

  it("rejects a negative listPrice", () => {
    const errors = validateProductForm(makeForm({ listPrice: "-1" }));
    expect(errors.listPrice).toBeDefined();
  });

  it("rejects a discountPercent over 100", () => {
    const errors = validateProductForm(makeForm({ discountPercent: "150" }));
    expect(errors.discountPercent).toMatch(/between 0 and 100/i);
  });

  it("rejects a negative discountPercent", () => {
    const errors = validateProductForm(makeForm({ discountPercent: "-1" }));
    expect(errors.discountPercent).toBeDefined();
  });

  it("accepts a valid listPrice/discountPercent pair", () => {
    const errors = validateProductForm(makeForm({ listPrice: "100", discountPercent: "10" }));
    expect(errors.listPrice).toBeUndefined();
    expect(errors.discountPercent).toBeUndefined();
  });
});

describe("resolveSellingPrice", () => {
  it("defaults to 0 when both price and purchasePrice are blank", () => {
    expect(resolveSellingPrice("", "")).toBe(0);
  });

  it("falls back to purchasePrice when price is left blank", () => {
    expect(resolveSellingPrice("", "80")).toBe(80);
  });

  it("prefers price over purchasePrice when both are given", () => {
    expect(resolveSellingPrice("100", "80")).toBe(100);
  });

  it("falls back to purchasePrice when price is a negative number", () => {
    expect(resolveSellingPrice("-5", "80")).toBe(80);
  });

  it("falls back to purchasePrice when price is non-numeric garbage", () => {
    expect(resolveSellingPrice("abc", "80")).toBe(80);
  });

  it("defaults to 0 when both price and purchasePrice are negative", () => {
    expect(resolveSellingPrice("-5", "-10")).toBe(0);
  });
});
