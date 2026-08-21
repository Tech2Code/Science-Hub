// Pure GST-compliance checks for the GST Filing package builder — mirrors validation.ts's form rules but runs over stored data in bulk, not a single field.

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  reference?: string; // invoice/bill number this issue relates to, if any
}

// Standard Indian GST rate slabs — anything outside this set is unusual, not necessarily wrong, so it's a warning not an error.
const STANDARD_GST_RATES = new Set([0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28]);

export function isValidGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase());
}

// GSTIN's first 2 digits are the GST state code (valid range 01-38) — out of range means mistyped even if the format regex matches.
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
