"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface PdfPreviewModalProps {
  url: string;
  fileName: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function PdfPreviewModal({ url, fileName, title, subtitle, onClose }: PdfPreviewModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || window.innerWidth < 768;
    setIsMobile(mobile);
  }, []);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleOpenInBrowser() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--c-bg-card)",
          borderRadius: "1rem",
          boxShadow: "0 32px 64px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.08)",
          display: "flex", flexDirection: "column",
          width: "min(920px, 96vw)",
          height: "min(92vh, 1120px)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.875rem",
          padding: "0.875rem 1.25rem",
          borderBottom: "1px solid var(--c-border)",
          background: "var(--c-bg-sub)",
          flexShrink: 0,
        }}>
          {/* PDF file icon */}
          <div style={{
            width: "2.25rem", height: "2.25rem", flexShrink: 0,
            background: "var(--c-red-bg)", borderRadius: "0.625rem",
            border: "1px solid var(--c-red-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
              <polyline points="9 9 10 9 11 9"/>
            </svg>
          </div>

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--c-text)", lineHeight: 1.3 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {subtitle} &middot; Review before downloading
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            <Button variant="primary" size="sm" onClick={handleDownload}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </Button>
            <button
              onClick={onClose}
              title="Close preview"
              style={{
                width: "2rem", height: "2rem", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "0.5rem",
                border: "1px solid var(--c-border)",
                background: "var(--c-bg-card)",
                color: "var(--c-text-3)",
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => {
                const b = e.currentTarget;
                b.style.background = "var(--c-red-bg)";
                b.style.color = "var(--c-red)";
                b.style.borderColor = "var(--c-red-border)";
              }}
              onMouseLeave={e => {
                const b = e.currentTarget;
                b.style.background = "var(--c-bg-card)";
                b.style.color = "var(--c-text-3)";
                b.style.borderColor = "var(--c-border)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        {isMobile ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "1.25rem", padding: "2rem", background: "#525659",
          }}>
            <div style={{
              width: "3.5rem", height: "3.5rem", borderRadius: "1rem",
              background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
                <line x1="9" y1="17" x2="15" y2="17"/>
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff", marginBottom: "0.375rem" }}>{title}</div>
              <div style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.6)" }}>
                PDF preview is not supported on mobile browsers.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", width: "100%", maxWidth: "16rem" }}>
              <Button variant="primary" size="md" onClick={handleDownload} style={{ justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PDF
              </Button>
              <button
                onClick={handleOpenInBrowser}
                style={{
                  padding: "0.625rem 1.25rem", borderRadius: "var(--c-radius-sm)",
                  border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Browser
              </button>
            </div>
          </div>
        ) : (
          <iframe
            src={url}
            style={{ flex: 1, border: "none", width: "100%", display: "block", background: "#525659" }}
            title={`${title} PDF Preview`}
          />
        )}
      </div>
    </div>
  );
}
