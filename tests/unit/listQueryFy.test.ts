import { describe, it, expect } from "vitest";
import { dateRangeFromParams } from "@/lib/listQuery";

const q = (s: string) => new URLSearchParams(s);
const iso = (r?: { gte: Date; lt: Date }) => r && [r.gte.toISOString(), r.lt.toISOString()];

describe("dateRangeFromParams", () => {
  it("fy alone is Apr 1 (IST) to next Apr 1 (IST)", () => {
    expect(iso(dateRangeFromParams(q("fy=2026")))).toEqual(["2026-03-31T18:30:00.000Z", "2027-03-31T18:30:00.000Z"]);
  });
  it("Apr–Dec belong to the FY's first calendar year", () => {
    expect(iso(dateRangeFromParams(q("fy=2026&month=3")))).toEqual(["2026-03-31T18:30:00.000Z", "2026-04-30T18:30:00.000Z"]);
    expect(iso(dateRangeFromParams(q("fy=2026&month=11")))).toEqual(["2026-11-30T18:30:00.000Z", "2026-12-31T18:30:00.000Z"]);
  });
  it("Jan–Mar belong to the FY's second calendar year", () => {
    expect(iso(dateRangeFromParams(q("fy=2026&month=0")))).toEqual(["2026-12-31T18:30:00.000Z", "2027-01-31T18:30:00.000Z"]);
    expect(iso(dateRangeFromParams(q("fy=2026&month=2")))).toEqual(["2027-02-28T18:30:00.000Z", "2027-03-31T18:30:00.000Z"]);
  });
  it("without fy it keeps the legacy month/year behaviour", () => {
    expect(iso(dateRangeFromParams(q("year=2025")))).toEqual(["2024-12-31T18:30:00.000Z", "2025-12-31T18:30:00.000Z"]);
    expect(dateRangeFromParams(q(""))).toBeUndefined();
  });
  it("malformed input means no filter", () => {
    expect(dateRangeFromParams(q("fy=26"))).toBeUndefined();
    expect(dateRangeFromParams(q("fy=2026&month=12"))).toBeUndefined();
  });
});

import { financialYearRangeFromParams } from "@/lib/listQuery";
describe("financialYearRangeFromParams", () => {
  it("ignores the month, so 'other years' never counts the same year's other months", () => {
    expect(iso(financialYearRangeFromParams(q("fy=2026&month=7")))).toEqual(iso(dateRangeFromParams(q("fy=2026"))));
  });
});
