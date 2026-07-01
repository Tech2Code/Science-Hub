"use client";

import styles from "./Skeleton.module.css";

export function Sk({ w = "100%", h = 14, r = 5 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div
      className={styles.sk}
      style={{ width: w, height: h, borderRadius: r }}
    />
  );
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
