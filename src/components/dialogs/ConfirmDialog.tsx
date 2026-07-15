"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import styles from "./ConfirmDialog.module.css";

interface Props {
  open: boolean;
  title: string;
  message: string;
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Capture the trigger element and move focus into the dialog when it
  // opens; restore focus to the trigger once it closes.
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
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;
        const focusable = Array.from(
          dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
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
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onCancel} />
      <div className={styles.center}>
        <div className={styles.dialog} ref={dialogRef} tabIndex={-1}>
          <div className={styles.body}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.message}>{message}</p>
            {detail && <div className={styles.detail}>{detail}</div>}
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              onClick={onConfirm}
              loading={loading}
              disabled={loading || confirmDisabled}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
