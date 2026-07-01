"use client";

import styles from "./Spinner.module.css";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const cls = [styles.spinner, styles[size], className].filter(Boolean).join(" ");
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      {/* track */}
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.15" />
      {/* spinning arc */}
      <path
        d="M12 2.5A9.5 9.5 0 0 1 21.5 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Full-screen modal overlay used for async actions (save, delete, restore…) ── */
export function OverlayLoader({ text }: { text: string }) {
  return (
    <div className={styles.overlayBackdrop}>
      <div className={styles.overlayCard}>
        <Spinner size="lg" />
        <span className={styles.overlayText}>{text}</span>
      </div>
    </div>
  );
}

/* ── Centered full-area loading state used by every page ────────── */
export function PageLoader() {
  return (
    <div className={styles.pageLoader}>
      <Spinner size="lg" />
      <span className={styles.pageLoaderText}>Loading…</span>
    </div>
  );
}
