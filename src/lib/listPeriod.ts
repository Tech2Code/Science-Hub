"use client";

import { useState } from "react";
import { calYearOf, currentFyStartYear, type PeriodValue } from "@/components/dashboard/PeriodFilter";

// Shared Financial Year + Month period state for list pages. Defaults to the CURRENT financial year
// (whole year, or its current month when asked) so a list opens on what the business is working on now;
// older years are one dropdown away. Replaces the old calendar "All Months / All Years" filter.

// IST calendar month (0-11) of "now" — same IST-safe derivation PeriodFilter uses for disabling future months.
function currentIstMonth0(): number {
  const [, m] = new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" }).split("-");
  return Number(m) - 1;
}

export function defaultListPeriod(month: "all" | "current" = "current"): PeriodValue {
  return { fyStartYear: currentFyStartYear(), month0: month === "current" ? currentIstMonth0() : "all" };
}

export function useListPeriod(month: "all" | "current" = "current") {
  return useState<PeriodValue>(() => defaultListPeriod(month));
}

// Query params for a list/stats route: ?fy=YYYY[&month=0-11]. `skip` (an active search) drops the period
// so searching finds a document from any year.
export function setPeriodParams(params: URLSearchParams, p: PeriodValue, skip = false): void {
  if (skip) return;
  params.set("fy", String(p.fyStartYear));
  if (p.month0 !== "all") params.set("month", String(p.month0));
}

// Calendar month/year of a month-scoped period (for bulk-download file names); null for a whole-FY period.
export function periodMonthYear(p: PeriodValue): { month0: number; year: number } | null {
  return p.month0 === "all" ? null : { month0: p.month0, year: calYearOf(p.fyStartYear, p.month0) };
}
