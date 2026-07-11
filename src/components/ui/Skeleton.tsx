"use client";

import styles from "./Skeleton.module.css";

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

export function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={styles.cell}>
              <Sk w={c === 0 ? "60%" : c === cols - 1 ? 80 : "80%"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
