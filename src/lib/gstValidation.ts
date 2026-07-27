// Pure GST-compliance checks reused by the GST Filing package builder.
// Each `isValid*` helper mirrors the format rules already enforced on
// input forms (src/lib/validation.ts's `rules.gstin` etc.) — kept separate
// here because these run over *stored* data in bulk, not a single form field.

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  reference?: string; // invoice/bill number this issue relates to, if any
}

// Standard Indian GST rate slabs (incl. the reduced/special-category rates
// used for select goods) — anything outside this set is unusual, not
// necessarily wrong, so it's flagged as a warning rather than an error.
const STANDARD_GST_RATES = new Set([0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28]);

export function isValidGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase());
}

// GSTIN's first 2 digits are the GST state code — valid range is 01–38
// (as of the current state/UT list). A value outside this range means the
// GSTIN was mistyped even if it otherwise matches the format regex.
export function hasValidGstinStateCode(gstin: string): boolean {
  const code = parseInt(gstin.trim().slice(0, 2), 10);
  return Number.isFinite(code) && code >= 1 && code <= 38;
}

export function isStandardGstRate(rate: number): boolean {
  return STANDARD_GST_RATES.has(Math.round(rate * 100) / 100);
}

export function amountsMatch(a: number, b: number, tolerance = 0.02): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function issue(severity: ValidationSeverity, category: string, message: string, reference?: string): ValidationIssue {
  return { severity, category, message, reference };
}
