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

/* ── Dual-ring counter-rotating gradient spinner with center core ──
   High-contrast multi-tone gradients so it never blends into light or dark UI. */
export function FloatingSpinner() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.floatingSpinner} role="status" aria-label="Loading">
      <svg className={styles.floatingSvg} viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="spinOuterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--spin-outer-start)" />
            <stop offset="50%" stopColor="var(--spin-outer-mid)" />
            <stop offset="100%" stopColor="var(--spin-outer-end)" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="spinInnerGrad" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--spin-inner-start)" />
            <stop offset="100%" stopColor="var(--spin-inner-end)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <circle className={styles.floatingTrackOuter} cx="28" cy="28" r="22" strokeWidth="4" />
        <circle className={styles.floatingTrackInner} cx="28" cy="28" r="14" strokeWidth="3" />
        <circle
          className={styles.floatingArcOuter}
          cx="28"
          cy="28"
          r="22"
          stroke="url(#spinOuterGrad)"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle
          className={styles.floatingArcInner}
          cx="28"
          cy="28"
          r="14"
          stroke="url(#spinInnerGrad)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
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
