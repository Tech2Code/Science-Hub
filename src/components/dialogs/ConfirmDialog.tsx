"use client";

import React, { useEffect } from "react";
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
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onCancel} />
      <div className={styles.center}>
        <div className={styles.dialog}>
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
              disabled={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
