import { describe, it, expect } from "vitest";
import { parsePageParams, monthYearToDateRange, DEFAULT_PAGE_SIZE } from "@/lib/listQuery";

function params(obj: Record<string, string>) {
  return new URLSearchParams(obj);
}

describe("parsePageParams", () => {
  it("defaults to page 1 and the default page size when nothing is supplied", () => {
    const p = parsePageParams(params({}));
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(p.skip).toBe(0);
    expect(p.take).toBe(DEFAULT_PAGE_SIZE);
  });

  it("computes skip from page and pageSize", () => {
    const p = parsePageParams(params({ page: "3", pageSize: "20" }));
    expect(p.skip).toBe(40);
    expect(p.take).toBe(20);
  });

  it("clamps page below 1 up to 1", () => {
    expect(parsePageParams(params({ page: "0" })).page).toBe(1);
    expect(parsePageParams(params({ page: "-5" })).page).toBe(1);
  });

  it("clamps pageSize to the maxPageSize ceiling, preventing an unbounded 'show all' request", () => {
    const p = parsePageParams(params({ pageSize: "999999" }), 2000);
    expect(p.pageSize).toBe(2000);
  });

  it("falls back to the default when pageSize is 0 (falsy, so it short-circuits before the Math.max(1, ...) clamp)", () => {
    expect(parsePageParams(params({ pageSize: "0" })).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps a negative pageSize up to 1", () => {
    expect(parsePageParams(params({ pageSize: "-5" })).pageSize).toBe(1);
  });

  it("falls back to defaults on garbage input rather than NaN", () => {
    const p = parsePageParams(params({ page: "abc", pageSize: "xyz" }));
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("monthYearToDateRange", () => {
  it("returns undefined when neither month nor year is given", () => {
    expect(monthYearToDateRange("", "")).toBeUndefined();
  });

  it("returns a full-year range when only year is given", () => {
    const range = monthYearToDateRange("", "2025");
    expect(range?.gte).toEqual(new Date(2025, 0, 1));
    expect(range?.lt).toEqual(new Date(2026, 0, 1));
  });

  it("returns a single-month range when both month and year are given", () => {
    const range = monthYearToDateRange("2", "2025"); // March (0-indexed)
    expect(range?.gte).toEqual(new Date(2025, 2, 1));
    expect(range?.lt).toEqual(new Date(2025, 3, 1));
  });

  it("handles December (month index 11) rolling into the next year", () => {
    const range = monthYearToDateRange("11", "2025");
    expect(range?.gte).toEqual(new Date(2025, 11, 1));
    expect(range?.lt).toEqual(new Date(2026, 0, 1));
  });
});
