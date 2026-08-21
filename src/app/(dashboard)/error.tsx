"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

// Dashboard-wide error boundary; sits alongside layout.tsx so sidebar/topbar chrome stays mounted on crash.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "1rem", padding: "4rem 1.5rem", textAlign: "center", minHeight: "60vh",
    }}>
      <div style={{
        width: "3rem", height: "3rem", borderRadius: "50%",
        background: "var(--c-red-bg)", border: "1px solid var(--c-red-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </div>
      <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--c-text)", margin: 0 }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: "0.875rem", color: "var(--c-text-3)", maxWidth: "26rem", margin: 0 }}>
        This page ran into an unexpected error. Your data hasn&rsquo;t been affected — try again, or head back to the dashboard.
      </p>
      <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.25rem" }}>
        <Button variant="primary" size="sm" onClick={() => reset()}>Try again</Button>
        <Button variant="secondary" size="sm" href="/dashboard">Go to Dashboard</Button>
      </div>
    </div>
  );
}
