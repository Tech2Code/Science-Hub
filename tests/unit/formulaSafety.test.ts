import { describe, it, expect } from "vitest";
import { neutralizeFormulaCell } from "@/lib/formulaSafety";

describe("neutralizeFormulaCell", () => {
  it("prefixes classic formula triggers with an apostrophe", () => {
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(neutralizeFormulaCell(v)).toBe(`'${v}`);
  });

  it("also neutralizes a leading tab or carriage return", () => {
    expect(neutralizeFormulaCell("\t=cmd")).toBe("'\t=cmd");
    expect(neutralizeFormulaCell("\r=cmd")).toBe("'\r=cmd");
  });

  it("leaves safe strings and non-strings untouched", () => {
    expect(neutralizeFormulaCell("Acme Ltd")).toBe("Acme Ltd");
    expect(neutralizeFormulaCell(42)).toBe(42);
  });
});
