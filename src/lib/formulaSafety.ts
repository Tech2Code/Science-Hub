// Neutralizes CSV/Excel formula injection: a cell value beginning with =, +, -, or @ can be
// interpreted as a formula by Excel (always for CSV, which carries no per-cell type metadata;
// defense-in-depth for genuine .xlsx too, in case the file is later re-saved/re-exported as CSV
// or opened by a less strict spreadsheet app). Prefixing with a leading apostrophe is the
// standard OWASP-recommended mitigation — it forces the cell to render as literal text.
// A leading tab or carriage return is also treated as a trigger (OWASP CSV-injection guidance):
// some spreadsheet apps strip leading whitespace before evaluating, re-exposing a formula behind it.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function neutralizeFormulaCell<T>(value: T): T | string {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}
