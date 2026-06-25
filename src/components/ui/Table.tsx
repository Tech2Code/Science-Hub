/**
 * Column definition drives both the <th> header and every <td> in that column:
 *   cls     → className on <th> (e.g. "table-th-right")
 *   mobile  → responsive behaviour on ≤640px screens
 *     "hide"       → hidden on mobile
 *     "full"       → spans both grid columns (primary / action cells)
 *     "label"      → shows col.label as a small caption above the value
 *     "full+label" → full-width AND captioned (e.g. Stock badge)
 *
 * Adding a column: add one entry here → headers + skeleton + empty-state colSpan
 * all update automatically. Mobile behaviour is declared once per column.
 */
export type Column = {
  label: string;
  cls?: string;
  mobile?: "hide" | "full" | "label" | "full+label";
};

export function Cell({
  col,
  children,
  className,
  ...rest
}: { col: Column; children?: React.ReactNode } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  const dataAttrs: Record<string, string> = {};
  if (col.mobile === "hide")                                { dataAttrs["data-mobile-hide"] = ""; }
  if (col.mobile === "full" || col.mobile === "full+label") { dataAttrs["data-mobile-full"] = ""; }
  if (col.mobile === "label" || col.mobile === "full+label"){ dataAttrs["data-label"] = col.label; }

  const autoTdCls = col.cls === "table-th-right" ? "table-td-right" : undefined;
  const merged = [autoTdCls, className].filter(Boolean).join(" ") || undefined;

  return <td {...dataAttrs} className={merged} {...rest}>{children}</td>;
}
