"use client";

import styles from "./FillMaxButton.module.css";

interface FillMaxButtonProps {
  onClick: () => void;
  label: string;
  title?: string;
  /** Visual size/color to match the input it sits next to — see FillMaxButton.module.css for what each pairs with. */
  variant?: "amber" | "green";
}

// Quick-fill "pay the full amount" button that sits next to a money Input.
export function FillMaxButton({ onClick, label, title, variant = "amber" }: FillMaxButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${styles.btn} ${variant === "green" ? styles.green : styles.amber}`}
    >
      {label}
    </button>
  );
}
