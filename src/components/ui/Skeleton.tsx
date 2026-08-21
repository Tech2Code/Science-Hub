"use client";

import styles from "./Skeleton.module.css";
import type { Column } from "./Table";

export function Sk({ w = "100%", h = 14, r = 5 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div
      className={styles.sk}
      style={{ width: w, height: h, borderRadius: r }}
      aria-hidden="true"
    />
  );
}

// Use INLINE in the real markup instead of a separate skeleton JSX branch, so the surrounding
// structure stays one tree and can't fall out of sync between loading/loaded states.
export function SkeletonSwap({
  loading, w = 80, h = 14, r = 5, inline = false, children,
}: { loading: boolean; w?: string | number; h?: number; r?: number; inline?: boolean; children: React.ReactNode }) {
  if (loading) {
    // Pulsing box is aria-hidden (decorative); the sr-only text gives screen readers a "Loading" announcement instead.
    return (
      <span style={{ display: inline ? "inline-block" : "block" }}>
        <span className="sr-only">Loading</span>
        <span
          className={styles.sk}
          style={{ width: w, height: h, borderRadius: r, display: inline ? "inline-block" : "block" }}
          aria-hidden="true"
        />
      </span>
    );
  }
  return <>{children}</>;
}

// Pass `columns` (same Column[] as the real markup) so skeleton rows carry the same mobile data-attrs
// as loaded rows — otherwise the ≤640px card layout looks structurally wrong while loading. `cols` alone still works.
export function TableSkeleton({ cols, columns, rows = 6 }: { cols?: number; columns?: Column[]; rows?: number }) {
  const count = columns ? columns.length : (cols ?? 0);
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: count }).map((_, c) => {
            const col = columns?.[c];
            const dataAttrs: Record<string, string> = {};
            if (col?.mobile === "hide")                                  dataAttrs["data-mobile-hide"] = "";
            if (col?.mobile === "full" || col?.mobile === "full+label")  dataAttrs["data-mobile-full"] = "";
            if (col?.mobile === "label" || col?.mobile === "full+label") dataAttrs["data-label"] = col.label;
            return (
              <td key={c} className={styles.cell} {...dataAttrs}>
                <Sk w={c === 0 ? "60%" : c === count - 1 ? 80 : "80%"} />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
