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
export function monthYearToDateRange(month: string, year: string): { gte: Date; lt: Date } | undefined {
  if (!month && !year) return undefined;
  const y = year ? Number(year) : Number(toIstDateStr(new Date()).slice(0, 4));
  if (month) {
    const m = Number(month);
    const { start, end } = istMonthBoundsUtc(y, m);
    return { gte: start, lt: end };
  }
  return { gte: istDayStartUtc(`${y}-01-01`), lt: istDayStartUtc(`${y + 1}-01-01`) };
}
