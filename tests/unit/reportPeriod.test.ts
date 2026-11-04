import { describe, it, expect } from "vitest";
import { periodToDateRange, defaultReportRange } from "@/components/ui/ReportPeriodFilter";

describe("periodToDateRange", () => {
  it("a past FY covers Apr 1 – Mar 31 in full", () => {
    expect(periodToDateRange({ fyStartYear: 2025, month0: "all" }, "2026-11-04")).toEqual({ startDate: "2025-04-01", endDate: "2026-03-31" });
  });
  it("the running FY is clamped to today", () => {
    expect(periodToDateRange({ fyStartYear: 2026, month0: "all" }, "2026-11-04")).toEqual({ startDate: "2026-04-01", endDate: "2026-11-04" });
  });
  it("Jan–Mar months land in the FY's second calendar year, with the right last day", () => {
    expect(periodToDateRange({ fyStartYear: 2026, month0: 1 }, "2027-12-01")).toEqual({ startDate: "2027-02-01", endDate: "2027-02-28" });
    expect(periodToDateRange({ fyStartYear: 2027, month0: 1 }, "2029-01-01")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });
  it("Apr–Dec months land in the FY's first calendar year; a past month ends on its last day", () => {
    expect(periodToDateRange({ fyStartYear: 2026, month0: 8 }, "2026-11-04")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  });
  it("the default starts on the 1st and never runs past today", () => {
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const r = defaultReportRange(today);
    expect(r.startDate.endsWith("-01")).toBe(true);
    expect(r.endDate <= today && r.endDate >= r.startDate).toBe(true);
  });
});
