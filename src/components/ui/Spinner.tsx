"use client";

import { createPortal } from "react-dom";
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

/* ── Full-screen modal overlay used for async actions (save, delete, restore…) ──
   Portaled to document.body (same as ConfirmDialog/Modal) — an `.animate-card` ancestor's
   `animation: ... forwards` leaves a `transform` permanently applied after it finishes, and
   any transform on an ancestor gives `position: fixed` descendants a new containing block,
   trapping an inline-rendered overlay inside that card's box instead of covering the viewport. */
export function OverlayLoader({ text }: { text: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.overlayBackdrop}>
      <div className={styles.overlayCard}>
        <Spinner size="lg" />
        <span className={styles.overlayText}>{text}</span>
      </div>
    </div>,
    document.body
  );
}

/* ── Bare spinner, no backdrop/card — for background refetches where content is already dimmed ──
   Portaled for the same reason as OverlayLoader above. */
export function FloatingSpinner() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.floatingSpinner}>
      <Spinner size="lg" />
    </div>,
    document.body
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
