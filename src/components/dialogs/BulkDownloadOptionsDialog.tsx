"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import styles from "./BulkDownloadOptionsDialog.module.css";

export interface BulkDownloadOptions {
  includePdfs: boolean;
  includeAttachments: boolean;
}

interface Props {
  open: boolean;
  loading?: boolean;
  onConfirm: (options: BulkDownloadOptions) => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Lets the Purchase Bills list page's "Bulk Download (ZIP)" action include the generated bill PDF,
// the vendor's originally-uploaded attachment (scan/photo), or both, for every bill in the selected
// Month+Year period. Mirrors PdfCopyDialog's exact structure/behavior (own overlay, not the shared
// fullscreen Modal — same category of small "choose what to include in this download" popup).
export function BulkDownloadOptionsDialog({ open, loading = false, onConfirm, onCancel }: Props) {
  const [includePdfs, setIncludePdfs] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Reset checkboxes on open, during render (avoids an extra render pass vs. doing it in an effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setIncludePdfs(true); setIncludeAttachments(false); }
  }

  // Capture the trigger element, focus into the dialog on open, restore focus to it on close.
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

  const noneSelected = !includePdfs && !includeAttachments;
  const both = includePdfs && includeAttachments;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onCancel} />
      <div className={styles.center}>
        <div className={styles.dialog} ref={dialogRef} tabIndex={-1}>
          <div className={styles.body}>
            <h2 className={styles.title}>Bulk Download</h2>
            <p className={styles.subtitle}>Choose what to include for every bill in this period.</p>

            <div className={styles.options}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={includePdfs}
                  onChange={(e) => setIncludePdfs(e.target.checked)}
                />
                <div>
                  <div className={styles.optionLabel}>Generated Bill PDFs</div>
                  <div className={styles.optionHint}>Rendered by this app, same as each bill&apos;s own PDF button</div>
                </div>
              </label>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                />
                <div>
                  <div className={styles.optionLabel}>Attached Bill Files</div>
                  <div className={styles.optionHint}>The vendor&apos;s uploaded scan/photo — bills with none are skipped</div>
                </div>
              </label>
            </div>

            {both && (
              <div className={styles.notice}>Downloading both can take longer, depending on your internet speed.</div>
            )}
            {noneSelected && (
              <div className={styles.notice}>Select at least one option to download.</div>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => onConfirm({ includePdfs, includeAttachments })}
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
