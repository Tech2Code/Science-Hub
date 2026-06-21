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

/* ── Centered full-area loading state used by every page ────────── */
export function PageLoader() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "5rem 1rem",
      gap: "1rem",
    }}>
      <Spinner size="lg" />
      <span style={{ fontSize: "0.875rem", color: "var(--c-text-4)", fontWeight: 500 }}>
        Loading…
      </span>
    </div>
  );
}
