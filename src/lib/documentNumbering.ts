// Shared by /api/invoices and /api/purchase-bills. Pure functions (no Prisma import) so they're
// usable from client components (Settings page preview) as well as route handlers.

// Falls back to the business name's initials when no prefix is configured (e.g. "Science Hub" -> "SH").
export function deriveDefaultPrefix(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.slice(0, 4).map((w) => w[0]).join("") : businessName.slice(0, 3);
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "INV";
}

// Indian financial year runs 1 April - 31 March, not the calendar year — GST filing periods and
// document numbering both reset on this boundary (a 15 Jan 2027 bill belongs to FY "2026").
export function getIndianFinancialYear(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = January ... 3 = April
  return month >= 3 ? year : year - 1;
}

// Renders a start year as "2026-27" — matches common Indian FY shorthand (GSTR filings, etc).
export function formatFinancialYearLabel(startYear: number): string {
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type NumberFormatId = "prefix_fy_seq" | "seq_fy" | "prefix_seq_fy";

interface NumberFormatDef {
  id: NumberFormatId;
  label: string;
  hint: string;
  // Example rendered with a placeholder prefix, for the Settings UI preview.
  example: (prefix: string) => string;
  render: (prefix: string, yearLabel: string, seq: number) => string;
  // Matches a *fully rendered* number for this exact prefix+FY, capturing
  // the sequence — used to find the highest sequence already in use.
  matcher: (prefix: string, yearLabel: string) => RegExp;
  // Best-effort Prisma filter to narrow candidates before the regex scan runs in JS
  // (plain `startsWith` isn't always possible once the sequence isn't the last segment).
  dbFilter: (prefix: string, yearLabel: string) => { startsWith?: string; endsWith?: string };
}

// Three layouts: this app's own convention plus the common "sequence/FY" style (no zero-padding) many businesses already used.
export const NUMBER_FORMATS: Record<NumberFormatId, NumberFormatDef> = {
  prefix_fy_seq: {
    id: "prefix_fy_seq",
    label: "Prefix - Year - Number",
    hint: "This app's own layout — 4-digit padded sequence.",
    example: (prefix) => `${prefix}-2026-27-0001`,
    render: (prefix, yearLabel, seq) => `${prefix}-${yearLabel}-${String(seq).padStart(4, "0")}`,
    matcher: (prefix, yearLabel) => new RegExp(`^${escapeRegex(prefix)}-${escapeRegex(yearLabel)}-(\\d+)$`),
    dbFilter: (prefix, yearLabel) => ({ startsWith: `${prefix}-${yearLabel}-` }),
  },
  seq_fy: {
    id: "seq_fy",
    label: "Number / Year",
    hint: "No prefix, no zero-padding — matches many pre-existing manual numbering schemes.",
    example: () => "18/2026-27",
    render: (_prefix, yearLabel, seq) => `${seq}/${yearLabel}`,
    matcher: (_prefix, yearLabel) => new RegExp(`^(\\d+)/${escapeRegex(yearLabel)}$`),
    dbFilter: (_prefix, yearLabel) => ({ endsWith: `/${yearLabel}` }),
  },
  prefix_seq_fy: {
    id: "prefix_seq_fy",
    label: "Prefix - Number / Year",
    hint: "Keeps a prefix, no zero-padding.",
    example: (prefix) => `${prefix}-18/2026-27`,
    render: (prefix, yearLabel, seq) => `${prefix}-${seq}/${yearLabel}`,
    matcher: (prefix, yearLabel) => new RegExp(`^${escapeRegex(prefix)}-(\\d+)/${escapeRegex(yearLabel)}$`),
    dbFilter: (prefix, yearLabel) => ({ startsWith: `${prefix}-`, endsWith: `/${yearLabel}` }),
  },
};

// Default when unconfigured is "prefix_fy_seq" ("SH-2026-27-0001"); once a format is explicitly
// chosen in Settings, that choice is stored in BusinessSettings and this fallback never overrides it.
export function resolveNumberFormat(id: string | null | undefined): NumberFormatDef {
  return NUMBER_FORMATS[id as NumberFormatId] ?? NUMBER_FORMATS.prefix_fy_seq;
}

// Prisma `StringFilter`-shaped — pass straight into `where: { field: ... }`.
export function numberFormatDbFilter(formatId: string | null | undefined, prefix: string, yearLabel: string): { startsWith?: string; endsWith?: string } {
  return resolveNumberFormat(formatId).dbFilter(prefix, yearLabel);
}

// A string-sort trick only works when the sequence is a fixed-width right-most segment; "seq_fy"/
// "prefix_seq_fy" don't zero-pad, so "9/..." isn't lexicographically less than "10/..." — hence scanning in JS.
export function findMaxSequence(existingNumbers: string[], matcher: RegExp): number {
  let max = 0;
  for (const num of existingNumbers) {
    const m = num.match(matcher);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

// `existingNumbers` should already be narrowed via `dbFilter()` for this prefix+FY. `override`
// wins for exactly one call — caller must clear it once `overrideUsed` is true so it never re-applies.
export function computeNextNumber(
  existingNumbers: string[],
  formatId: string | null | undefined,
  prefix: string,
  yearLabel: string,
  override: number | null | undefined
): { documentNumber: string; overrideUsed: boolean } {
  const format = resolveNumberFormat(formatId);
  const lastSequentialNumber = findMaxSequence(existingNumbers, format.matcher(prefix, yearLabel));
  const overrideUsed = override != null && override > lastSequentialNumber;
  const sequentialNumber = overrideUsed ? (override as number) : lastSequentialNumber + 1;
  return {
    documentNumber: format.render(prefix, yearLabel, sequentialNumber),
    overrideUsed,
  };
}
