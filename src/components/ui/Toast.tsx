"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";

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

// dark-mode overrides
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
    requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(dismiss, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [duration, dismiss]);

  const bg = isDark ? cfg.bg : CFG[item.type].bg;
  const border = isDark ? cfg.border : CFG[item.type].border;

  const toastClass = [
    styles.toast,
    visible && !leaving ? styles.toastVisible : "",
    leaving ? styles.toastLeaving : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      role="alert"
      className={toastClass}
      style={{
        background: `var(--c-bg-card, ${bg})`,
        border: `1px solid ${border}`,
      }}
    >
      <div className={styles.colorBar} style={{ background: cfg.bar }} />
      <div className={styles.icon} style={{ background: cfg.bar }}>
        {cfg.icon}
      </div>
      <div className={styles.textWrap}>
        <div className={styles.title} style={{ color: `var(--c-text, ${cfg.title})` }}>
          {item.title}
        </div>
        {item.message && (
          <div className={styles.message}>{item.message}</div>
        )}
      </div>
      <button onClick={dismiss} className={styles.closeBtn} aria-label="Dismiss">×</button>
      <div className={styles.progressTrack} style={{ background: `${cfg.bar}30` }}>
        <div
          className={styles.progressBar}
          style={{ background: cfg.bar, "--toast-duration": `${duration}ms` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast: AddToast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { ...t, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div aria-live="polite" className={styles.container}>
        {toasts.map(t => (
          <div key={t.id} className={styles.itemWrap}>
            <Toast item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
