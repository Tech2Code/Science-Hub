import { describe, it, expect } from "vitest";
import { parseProductRows, parsePastedProductText } from "@/lib/productImport";

describe("parseProductRows — header detection", () => {
  it("detects a proper header row regardless of column order or case, mapping List Price/Discount %/Selling Price to their own fields", () => {
    const rows = [
      ["Name", "List Price", "discount %", "selling price", "Unit", "GST"],
      ["Beaker", "100", "10", "95", "Nos", "18"],
    ];
    const { items } = parseProductRows(rows);
    expect(items).toEqual([
      {
        name: "Beaker", sku: "", hsn: "", unit: "Nos",
        listPrice: "100", discountPercent: "10", price: "95",
        gstRate: "18", stock: "0", minStock: "10",
        brand: "", category: "",
      },
    ]);
  });

  it("falls back to a 10-column positional guess for a headerless paste", () => {
    // Name, SKU, HSN, Unit, List Price, Discount %, Selling Price, GST %, Stock, Min Stock
    const rows = [["Sodium Nitrate", "SN-001", "28151100", "Kg", "450", "15", "400", "18", "100", "20"]];
    const { items } = parseProductRows(rows);
    expect(items).toEqual([
      {
        name: "Sodium Nitrate", sku: "SN-001", hsn: "28151100", unit: "Kg",
        listPrice: "450", discountPercent: "15", price: "400",
        gstRate: "18", stock: "100", minStock: "20",
        brand: "", category: "",
      },
    ]);
  });

  it("skips a row with a name but no List Price, rather than defaulting it from Selling Price", () => {
    const rows = [
      ["Name", "List Price", "Selling Price"],
      ["No Cost Item", "", "50"],
      ["Real Item", "80", ""],
    ];
    const { items, skipped } = parseProductRows(rows);
    expect(skipped).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Real Item", listPrice: "80", price: "" });
  });

  it("leaves Selling Price blank rather than inventing one when the sheet has no such column", () => {
    const rows = [
      ["Name", "List Price"],
      ["Beaker", "100"],
    ];
    const { items } = parseProductRows(rows);
    expect(items[0]).toMatchObject({ name: "Beaker", listPrice: "100", price: "" });
  });
});

describe("parsePastedProductText", () => {
  it("splits a tab-separated Excel-style paste", () => {
    const text = "Name\tList Price\tDiscount %\tSelling Price\nBeaker\t100\t10\t95";
    const { items } = parsePastedProductText(text);
    expect(items).toEqual([
      {
        name: "Beaker", sku: "", hsn: "", unit: "Nos",
        listPrice: "100", discountPercent: "10", price: "95",
        gstRate: "18", stock: "0", minStock: "10",
        brand: "", category: "",
      },
    ]);
  });
});
