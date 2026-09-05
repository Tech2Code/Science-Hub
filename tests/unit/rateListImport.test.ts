import { describe, it, expect } from "vitest";
import { parseRateListRows, parseCsvLine, parsePastedRateListText } from "@/lib/rateListImport";

describe("parseCsvLine", () => {
  it("splits a plain comma-separated line", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a quoted field with an embedded comma as one field", () => {
    expect(parseCsvLine('Widget,"1,902.00",Nos')).toEqual(["Widget", "1,902.00", "Nos"]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsvLine('"5"" pipe",100')).toEqual(['5" pipe', "100"]);
  });
});

describe("parseRateListRows — header detection", () => {
  it("detects a proper header row regardless of column order or case", () => {
    const rows = [
      ["Unit", "LIST RATE", "brand", "Name", "Discount"],
      ["Kg", "100", "Acme", "Widget", "10"],
    ];
    const { items } = parseRateListRows(rows);
    expect(items).toEqual([
      { name: "Widget", brand: "Acme", unit: "Kg", isNetRate: false, discountPercent: "10", listRate: "100" },
    ]);
  });

  it("falls back to a 7-column positional guess for a headerless supplier-shaped paste", () => {
    // S.No, Chemical, Brand, Unit, Discount, List Rate, Amount
    const rows = [["1", "Acid X", "Merck", "500 GM", "Net Rate", "250", "250"]];
    const { items } = parseRateListRows(rows);
    expect(items).toEqual([
      { name: "Acid X", brand: "Merck", unit: "500 GM", isNetRate: true, discountPercent: "0", listRate: "250" },
    ]);
  });

  it("falls back to a 5-column positional guess (name, brand, unit, discount, listRate) without cross-mapping the 7-column shape", () => {
    const rows = [["Beaker", "Borosil", "Pcs", "5", "300"]];
    const { items } = parseRateListRows(rows);
    expect(items).toEqual([
      { name: "Beaker", brand: "Borosil", unit: "Pcs", isNetRate: false, discountPercent: "5", listRate: "300" },
    ]);
  });

  it("sets isNetRate and zeroes discountPercent for a 'Net Rate' discount cell in any case/spacing", () => {
    const rows = [
      ["Name", "Unit", "Discount", "List Rate"],
      ["Item A", "Nos", "net   rate", "50"],
      ["Item B", "Nos", "NET RATE", "60"],
    ];
    const { items } = parseRateListRows(rows);
    expect(items[0]).toMatchObject({ isNetRate: true, discountPercent: "0" });
    expect(items[1]).toMatchObject({ isNetRate: true, discountPercent: "0" });
  });

  it("defaults a malformed, non-numeric discount cell to 0 instead of throwing", () => {
    const rows = [
      ["Name", "Unit", "Discount", "List Rate"],
      ["Item A", "Nos", "n/a", "50"],
    ];
    expect(() => parseRateListRows(rows)).not.toThrow();
    const { items } = parseRateListRows(rows);
    expect(items[0]).toMatchObject({ isNetRate: false, discountPercent: "0" });
  });

  it("skips rows missing a name or list rate and counts them as skipped", () => {
    const rows = [
      ["Name", "Unit", "List Rate"],
      ["", "Nos", "100"],
      ["Valid Item", "Nos", ""],
      ["Real Item", "Nos", "75"],
    ];
    const { items, skipped } = parseRateListRows(rows);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Real Item");
    expect(skipped).toBe(2);
  });
});

describe("parsePastedRateListText", () => {
  it("splits an Excel-style tab-separated paste", () => {
    const text = "Name\tUnit\tList Rate\nWidget\tKg\t100";
    const { items } = parsePastedRateListText(text);
    expect(items).toEqual([
      { name: "Widget", brand: "", unit: "Kg", isNetRate: false, discountPercent: "0", listRate: "100" },
    ]);
  });

  it("falls back to comma-split CSV parsing when no tabs are present", () => {
    const text = "Name,Unit,List Rate\nWidget,Kg,100";
    const { items } = parsePastedRateListText(text);
    expect(items[0].name).toBe("Widget");
    expect(items[0].listRate).toBe("100");
  });
});
