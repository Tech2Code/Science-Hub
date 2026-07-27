// Shared server-side query-param parsing for the paginated list routes
// (invoices, purchase-bills, credit-notes) — kept in one place so the three
// routes can't drift on page/pageSize clamping or month/year → date-range
// semantics.

export const DEFAULT_PAGE_SIZE = 10;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

// `maxPageSize` is the "Show all" safety ceiling — the same hard caps the
// app already used before pagination (2000 for invoices/bills, 5000 for
// credit notes), so a "show all" request can't ask for an unbounded result set.
export function parsePageParams(searchParams: URLSearchParams, maxPageSize = 2000): PageParams {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requestedPageSize), maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// month is a JS month index ("0".."11") string, year is "YYYY" — both are
// independently optional strings straight off the MonthYearFilter selects.
// Year-only → the whole year. Month-only → that month of the CURRENT year
// (a deliberate simplification vs. the old client-side filter, which matched
// that month across every year — a raw "EXTRACT(MONTH FROM date)" query would
// be needed to preserve that exactly, which isn't worth it for what's normally
// used alongside a year anyway). Both set → that specific month.
export function monthYearToDateRange(month: string, year: string): { gte: Date; lt: Date } | undefined {
  if (!month && !year) return undefined;
  const y = year ? Number(year) : new Date().getFullYear();
  if (month) {
    const m = Number(month);
    return { gte: new Date(y, m, 1), lt: new Date(y, m + 1, 1) };
  }
  return { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
}
