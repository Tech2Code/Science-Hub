"use client";

import Link from "next/link";
import styles from "./InfoBanner.module.css";

interface Props {
  message: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export function InfoBanner({ message, actionHref, actionLabel, onAction, onDismiss }: Props) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">ℹ️</span>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {actionHref && actionLabel && (
          <Link href={actionHref} className={styles.actionLink}>{actionLabel}</Link>
        )}
        {onAction && actionLabel && !actionHref && (
          <button type="button" className={styles.actionLink} onClick={onAction}>{actionLabel}</button>
        )}
        <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
