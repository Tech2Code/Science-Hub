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

/**
 * Renders `children` when not loading; otherwise renders a pulsing
 * placeholder box in the same spot, sized by `w`/`h`/`r`. Use this INLINE in
 * the real markup instead of writing a separate skeleton JSX branch — since
 * the surrounding structure (labels, buttons, layout) is the same tree
 * whether loading or not, adding/removing a sibling element automatically
 * shows up correctly in both states. There's no parallel skeleton tree that
 * can fall out of sync with the real one.
 */
export function SkeletonSwap({
  loading, w = 80, h = 14, r = 5, inline = false, children,
}: { loading: boolean; w?: string | number; h?: number; r?: number; inline?: boolean; children: React.ReactNode }) {
  if (loading) {
    // The pulsing box itself is aria-hidden (purely decorative) so screen
    // readers don't announce an empty heading/label while this placeholder
    // sits inside real semantic markup (e.g. <h1>) — the sr-only text gives
    // them a proper "Loading" announcement instead of silence.
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

/**
 * Pass `columns` (the same Column[] driving the real <th>/<Cell> markup)
 * whenever it's available, so the skeleton rows carry the identical
 * data-mobile-hide/data-mobile-full/data-label attributes as the loaded
 * rows — without them, the ≤640px card layout hides/spans/captions cells
 * differently while loading than once data arrives, so the skeleton looks
 * structurally wrong on mobile even though desktop looks fine. `cols` alone
 * still works for tables with no Column[] (falls back to plain cells).
 */
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
