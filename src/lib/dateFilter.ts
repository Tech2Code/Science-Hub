// Shared month/year filter logic for list pages (Invoices, Purchase Bills,
// Credit Notes) that filter an already-fetched array client-side, matching
// how search/sort/status filtering already works on those pages.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// month/year are kept as strings since they're driven straight off <Select>
// values — "" means "All" for either.
export function matchesMonthYear(dateStr: string, month: string, year: string): boolean {
  if (!month && !year) return true;
  const d = new Date(dateStr);
  if (month && d.getMonth() !== Number(month)) return false;
  if (year && d.getFullYear() !== Number(year)) return false;
  return true;
}

// Years present in the dataset, newest first, so the dropdown never shows a
// year with nothing in it — always includes the current year too, so the
// option is there for a brand-new list with no records yet this year.
export function yearsFromDates(dates: string[]): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const d of dates) {
    const y = new Date(d).getFullYear();
    if (!Number.isNaN(y)) years.add(y);
  }
  return Array.from(years).sort((a, b) => b - a);
}
