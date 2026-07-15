"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import styles from "./PdfCopyDialog.module.css";

interface Props {
  open: boolean;
  loading?: boolean;
  onConfirm: (copyLabels: string[]) => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PdfCopyDialog({ open, loading = false, onConfirm, onCancel }: Props) {
  const [original, setOriginal] = useState(true);
  const [duplicate, setDuplicate] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Reset the checkboxes whenever the dialog transitions to open. Adjusted
  // during render (React's recommended pattern for "reset state when a prop
  // changes") rather than in an effect, which would cause an extra render pass.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setOriginal(true); setDuplicate(true); }
  }

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

  const noneSelected = !original && !duplicate;

  function handleConfirm() {
    const labels: string[] = [];
    if (original) labels.push("ORIGINAL COPY");
    if (duplicate) labels.push("DUPLICATE COPY");
    onConfirm(labels);
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onCancel} />
      <div className={styles.center}>
        <div className={styles.dialog} ref={dialogRef} tabIndex={-1}>
          <div className={styles.body}>
            <h2 className={styles.title}>Download Invoice PDF</h2>
            <p className={styles.subtitle}>Choose which copies to include in the download.</p>

            <div className={styles.options}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={original}
                  onChange={(e) => setOriginal(e.target.checked)}
                />
                <div>
                  <div className={styles.optionLabel}>Original Copy</div>
                  <div className={styles.optionHint}>For recipient</div>
                </div>
              </label>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={duplicate}
                  onChange={(e) => setDuplicate(e.target.checked)}
                />
                <div>
                  <div className={styles.optionLabel}>Duplicate Copy</div>
                  <div className={styles.optionHint}>For your records</div>
                </div>
              </label>
            </div>

            {noneSelected && (
              <div className={styles.warning}>Select at least one copy to download.</div>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              loading={loading}
              disabled={loading || noneSelected}
            >
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
