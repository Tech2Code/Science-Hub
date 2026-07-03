"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import styles from "./PdfCopyDialog.module.css";

interface Props {
  open: boolean;
  loading?: boolean;
  onConfirm: (copyLabels: string[]) => void;
  onCancel: () => void;
}

export function PdfCopyDialog({ open, loading = false, onConfirm, onCancel }: Props) {
  const [original, setOriginal] = useState(true);
  const [duplicate, setDuplicate] = useState(true);

  // Reset the checkboxes whenever the dialog transitions to open. Adjusted
  // during render (React's recommended pattern for "reset state when a prop
  // changes") rather than in an effect, which would cause an extra render pass.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setOriginal(true); setDuplicate(true); }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
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
        <div className={styles.dialog}>
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
