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
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--c-bg-card)", borderRadius: "0.75rem",
        padding: "2rem 2.5rem", boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem",
        minWidth: "13rem",
      }}>
        <Spinner size="lg" />
        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--c-text-2)" }}>
          {text}
        </span>
      </div>
    </div>
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
