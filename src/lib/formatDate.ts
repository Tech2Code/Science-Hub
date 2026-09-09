// timeZone is pinned to IST — without it, toLocaleDateString/toLocaleString fall back to the
// rendering device's own local timezone, so the same invoice's date can render on a different
// calendar day depending on which machine/browser (or Vercel's UTC-timezone SSR pass) renders it.
// This is a GST billing app for an Indian business; every printed/displayed date must read as IST.
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

// Time-of-day only — used sparingly, only where a precise time genuinely carries meaning (e.g. the
// Stock Movement Ledger export, reconciling multiple same-day movements). Business documents
// (invoices, purchase bills, credit notes, payments) have no legal/professional use for a time
// component — GST filing, financial year, and the printed document itself all operate purely on
// the calendar day — so prefer formatDate() alone for anything document-dated; don't reach for this
// to label a "created at"/"edited at" sub-line under a document's own date.
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

// "Sep 2026"-style label for a dashboard/report "this month" heading.
export function formatMonthYear(date: Date | string = new Date()): string {
  return new Date(date).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
