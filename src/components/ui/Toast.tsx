"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 3500
}

type AddToast = (toast: Omit<ToastItem, "id">) => void;

// ── Context ──────────────────────────────────────────────────────
const ToastCtx = createContext<AddToast>(() => {});
export const useToast = () => useContext(ToastCtx);

// ── Config ───────────────────────────────────────────────────────
const CFG: Record<ToastType, { icon: string; bar: string; border: string; bg: string; title: string }> = {
  success: { icon: "✓", bar: "#22c55e", border: "#bbf7d0", bg: "#f0fdf4", title: "#15803d" },
  error:   { icon: "✕", bar: "#ef4444", border: "#fecaca", bg: "#fef2f2", title: "#dc2626" },
  warning: { icon: "!", bar: "#f59e0b", border: "#fde68a", bg: "#fffbeb", title: "#b45309" },
  info:    { icon: "i", bar: "#3b82f6", border: "#bfdbfe", bg: "#eff6ff", title: "#1d4ed8" },
};

// dark-mode overrides via CSS variables already on the page
const CFG_DARK: Record<ToastType, { bar: string; border: string; bg: string; title: string }> = {
  success: { bar: "#4ade80", border: "#166534", bg: "#052e16", title: "#4ade80" },
  error:   { bar: "#f87171", border: "#7f1d1d", bg: "#2c0909", title: "#f87171" },
  warning: { bar: "#fbbf24", border: "#78350f", bg: "#27200a", title: "#fbbf24" },
  info:    { bar: "#60a5fa", border: "#1e3a5f", bg: "#0a1929", title: "#60a5fa" },
};

// ── Single toast item ─────────────────────────────────────────────
function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = item.duration ?? 3500;
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const cfg = isDark ? { icon: CFG[item.type].icon, ...CFG_DARK[item.type] } : CFG[item.type];

  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), 280);
  }, [leaving, onDismiss, item.id]);

  useEffect(() => {
    // mount → slide in
    requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(dismiss, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [duration, dismiss]);

  const bg = isDark ? cfg.bg : CFG[item.type].bg;
  const border = isDark ? cfg.border : CFG[item.type].border;

  return (
    <div
      role="alert"
      style={{
        position: "relative", display: "flex", gap: "0.625rem", alignItems: "flex-start",
        padding: "0.75rem 1rem 0.75rem 0.875rem",
        borderRadius: "0.625rem",
        background: `var(--c-bg-card, ${bg})`,
        border: `1px solid ${border}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
        minWidth: 280, maxWidth: 360,
        transform: visible && !leaving ? "translateX(0) scale(1)" : "translateX(24px) scale(0.96)",
        opacity: visible && !leaving ? 1 : 0,
        transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease",
        overflow: "hidden",
        cursor: "default",
      }}
    >
      {/* Colour bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: cfg.bar, borderRadius: "0.625rem 0 0 0.625rem" }} />

      {/* Icon */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: cfg.bar, color: "#fff", fontSize: "0.7rem", fontWeight: 900,
        marginTop: 1,
      }}>
        {cfg.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: "0.125rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: `var(--c-text, ${cfg.title})`, lineHeight: 1.3 }}>
          {item.title}
        </div>
        {item.message && (
          <div style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", marginTop: "0.2rem", lineHeight: 1.4 }}>
            {item.message}
          </div>
        )}
      </div>

      {/* Close */}
      <button
        onClick={dismiss}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "0.125rem", color: "var(--c-text-4)", lineHeight: 1, fontSize: "1rem", flexShrink: 0, marginTop: -1 }}
        aria-label="Dismiss"
      >
        ×
      </button>

      {/* Progress bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 4, right: 0, height: 3,
        background: `${cfg.bar}30`,
        borderRadius: "0 0 0.625rem 0",
      }}>
        <div style={{
          height: "100%", background: cfg.bar, borderRadius: "0 0 0.625rem 0",
          animation: `toast-progress ${duration}ms linear forwards`,
        }} />
      </div>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast: AddToast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { ...t, id }]); // cap at 5 visible
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      {/* Portal-like fixed container */}
      <div
        aria-live="polite"
        style={{
          position: "fixed", top: "1rem", right: "1rem", zIndex: 9999,
          display: "flex", flexDirection: "column", gap: "0.5rem",
          pointerEvents: "none",
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <Toast item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </ToastCtx.Provider>
  );
}
