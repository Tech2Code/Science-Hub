// Shared by /api/invoices and /api/purchase-bills so both document types
// derive/apply a custom prefix and one-time "next number" override the same
// way. Pure functions — no Prisma import — so they're usable from a client
// component (Settings page, to preview the effective prefix) as well as
// route handlers.

// Falls back to the business name's initials when no explicit invoice
// prefix has been configured (e.g. "Science Hub" -> "SH", matching what
// this app always hardcoded before the prefix became configurable).
export function deriveDefaultPrefix(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.slice(0, 4).map((w) => w[0]).join("") : businessName.slice(0, 3);
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "INV";
}

// Indian businesses invoice against a financial year (1 April - 31 March),
// not the calendar year — GST filing periods, "FY 2026-27" labeling, etc.
// all follow this. Invoice/purchase-bill numbering resets on this boundary
// too: a bill dated 15 January 2027 belongs to FY "2026" (the year the FY
// started), same as one dated 15 April 2026, and both share one numbering
// sequence distinct from FY "2027" (starting 1 April 2027).
export function getIndianFinancialYear(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = January ... 3 = April
  return month >= 3 ? year : year - 1;
}

// Renders a financial-year start year as the "2026-27" label printed on
// documents — so the number itself shows which FY it belongs to, not just
// a bare calendar-ish year. Two-digit end year matches common Indian FY
// shorthand (GSTR filings, "FY26-27", etc).
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
  // Best-effort Prisma string filter to narrow candidate rows before the
  // regex scan above runs in JS (a plain `startsWith` isn't always possible
  // once the sequence isn't the number's last segment).
  dbFilter: (prefix: string, yearLabel: string) => { startsWith?: string; endsWith?: string };
}

// Three layouts covering both this app's own convention and the common
// "sequence/financial-year" style many Indian businesses already used
// before switching to this app (no zero-padding, sequence before the year).
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

// Default (when nothing's configured yet) is "seq_fy" — "18/2026-27", no
// prefix, no zero-padding — since that's the numbering scheme this
// business already used before adopting this app's own "SH-2026-27-0001"
// layout, and new businesses onboarding cold are just as likely to expect
// the plain "number/year" style already common outside this app.
export function resolveNumberFormat(id: string | null | undefined): NumberFormatDef {
  return NUMBER_FORMATS[id as NumberFormatId] ?? NUMBER_FORMATS.seq_fy;
}

// Prisma `StringFilter`-shaped — pass straight into `where: { field: ... }`.
export function numberFormatDbFilter(formatId: string | null | undefined, prefix: string, yearLabel: string): { startsWith?: string; endsWith?: string } {
  return resolveNumberFormat(formatId).dbFilter(prefix, yearLabel);
}

// A plain `startsWith`/`orderBy desc` string-sort trick (the original
// approach) only finds the true highest sequence when the sequence is the
// number's fixed-width, right-most segment. "seq_fy" and "prefix_seq_fy"
// deliberately don't zero-pad (to match pre-existing manual numbering), so
// "9/2026-27" must be recognized as less than "10/2026-27" numerically even
// though it isn't lexicographically — hence scanning candidates in JS.
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

// `existingNumbers` should already be narrowed via `dbFilter()` for this
// prefix+FY (see NUMBER_FORMATS above) — passing the whole table defeats
// the point of the DB filter but still produces a correct result.
// `override` (if set and higher than what auto-increment would produce)
// wins for exactly one call — the caller must clear it in the same
// transaction once `overrideUsed` comes back true, so it never re-applies
// to a later document.
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
