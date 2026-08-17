"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
  // "fullscreen" covers the entire viewport on mobile (no small centered card
  // to scroll a tall form inside of) and becomes a large centered panel on
  // wider screens. Use for forms too long to comfortably fit a small dialog.
  variant?: "center" | "fullscreen";
  // Rendered outside the scrollable body, pinned to the bottom — for a
  // form's Save/Cancel actions to stay reachable without scrolling to the
  // end of a long fullscreen form.
  footer?: React.ReactNode;
}

// Generic popup modal — centered dialog with a dark blurred backdrop, portaled
// to document.body so it always covers the full viewport regardless of where
// it's mounted (nesting it under an element with a CSS animation applied,
// e.g. animateSection's "animate-card", would otherwise trap it inside that
// ancestor's own stacking context and let later sections paint over it).
export function Modal({ open, title, onClose, maxWidth, children, variant = "center", footer }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const dialogEl = dialogRef.current;
    const focusable = dialogEl?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable && focusable.length > 0 ? focusable[0] : dialogEl)?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;
        const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={variant === "fullscreen" ? styles.centerFullscreen : styles.center}>
        <div
          className={[styles.dialog, variant === "fullscreen" ? styles.dialogFullscreen : ""].filter(Boolean).join(" ")}
          style={maxWidth ? { maxWidth } : undefined}
          ref={dialogRef}
          tabIndex={-1}
        >
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className={styles.body}>
            {children}
          </div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
