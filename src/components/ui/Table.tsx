// `mobile` drives ≤640px card layout: "hide" hides the cell, "full" spans both
// grid columns, "label" captions the value with col.label, "full+label" both.
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
