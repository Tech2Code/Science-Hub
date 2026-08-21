"use client";

import { useEffect } from "react";

// Root-layout error boundary; replaces the whole document, so it can't rely on globals.css/theme vars having loaded.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "1rem", minHeight: "100vh", padding: "1.5rem", textAlign: "center",
        }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: "24rem", margin: 0 }}>
            The application ran into an unexpected error. Please try again, or reload the page.
          </p>
          <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.25rem" }}>
            <button
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "none",
                background: "#2563eb", color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "1px solid #cbd5e1",
                background: "#fff", color: "#0f172a", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none",
              }}
            >
              Reload
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
