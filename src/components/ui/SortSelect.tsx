"use client";

import styles from "./SortSelect.module.css";

export interface SortOptionDef<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SortOptionDef<T>[];
  ariaLabel: string;
  label?: string;
}

export function SortSelect<T extends string>({ value, onChange, options, ariaLabel, label = "Sorting" }: Props<T>) {
  return (
    <label className={styles.sortWrap}>
      <span className={styles.sortLabel}>{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`search-input ${styles.sortSelect}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
