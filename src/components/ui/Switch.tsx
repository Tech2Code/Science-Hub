"use client";

import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  loading?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function Switch({ checked, onChange, disabled, loading, "aria-label": ariaLabel, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={[styles.switch, checked ? styles.switchOn : "", loading ? styles.switchLoading : ""].filter(Boolean).join(" ")}
    >
      <span className={styles.switchThumb} />
      {loading && <span className={styles.switchSpinner} />}
    </button>
  );
}
