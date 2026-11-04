// Shared query-param parsing for paginated list routes, so page/pageSize clamping and month/year → date-range semantics can't drift between routes.

import { toIstDateStr, istDayStartUtc, istMonthBoundsUtc } from "@/lib/validation";

export const DEFAULT_PAGE_SIZE = 10;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

// `maxPageSize` caps a "Show all" request so it can't ask for an unbounded result set.
export function parsePageParams(searchParams: URLSearchParams, maxPageSize = 2000): PageParams {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requestedPageSize), maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// month is JS month index "0".."11", year is "YYYY", both optional. Year-only → whole year; month-only → that month of the CURRENT year
// (deliberate simplification vs. matching that month across every year); both set → that specific month.
// Boundaries are computed IST-aware (istMonthBoundsUtc/istDayStartUtc) rather than via local Date
// constructors — those read the calling environment's local timezone (UTC by default on Vercel),
// which would mis-bucket anything created IST 00:00-05:29 into the previous UTC day/month/year.
// Malformed input (year not 4 digits, month not an integer 0-11) returns undefined — "no filter" —
// rather than producing an Invalid Date that would make the Prisma query throw and the route 500.
export function monthYearToDateRange(month: string, year: string): { gte: Date; lt: Date } | undefined {
  if (!month && !year) return undefined;
  if (year && !/^\d{4}$/.test(year)) return undefined;
  if (month && !/^(\d|1[01])$/.test(month)) return undefined;
  const y = year ? Number(year) : Number(toIstDateStr(new Date()).slice(0, 4));
  if (month) {
    const m = Number(month);
    const { start, end } = istMonthBoundsUtc(y, m);
    return { gte: start, lt: end };
  }
  return { gte: istDayStartUtc(`${y}-01-01`), lt: istDayStartUtc(`${y + 1}-01-01`) };
}

// Financial-year aware range for list routes: `fy` is the FY's Apr start-year ("2026" = Apr 2026 – Mar 2027)
// and `month` (optional, "0".."11" calendar index, same as the legacy param) narrows it to one month of that FY.
// Months Jan–Mar (0–2) fall in the FY's SECOND calendar year. Without `fy` this behaves exactly like
// monthYearToDateRange(month, year), so every older caller/URL keeps working. Malformed input → no filter.
export function dateRangeFromParams(searchParams: URLSearchParams): { gte: Date; lt: Date } | undefined {
  const fy = searchParams.get("fy") ?? "";
  const month = searchParams.get("month") ?? "";
  if (!fy) return monthYearToDateRange(month, searchParams.get("year") ?? "");
  if (!/^\d{4}$/.test(fy)) return undefined;
  if (month && !/^(\d|1[01])$/.test(month)) return undefined;
  const start = Number(fy);
  if (month) {
    const m = Number(month);
    const { start: s, end } = istMonthBoundsUtc(m >= 3 ? start : start + 1, m);
    return { gte: s, lt: end };
  }
  return { gte: istDayStartUtc(`${start}-04-01`), lt: istDayStartUtc(`${start + 1}-04-01`) };
}

// The period a list is scoped to for the purpose of "money unpaid on documents from OTHER years": the whole
// financial year even when a single month is selected, so the notice never counts the same year's other months.
export function financialYearRangeFromParams(searchParams: URLSearchParams): { gte: Date; lt: Date } | undefined {
  const params = new URLSearchParams(searchParams);
  params.delete("month");
  return dateRangeFromParams(params);
}
