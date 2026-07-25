"use client";

import React from "react";
import styles from "./PhoneInput.module.css";

interface PhoneInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

// Every mobile-number field in the app should use this — a fixed "+91"
// prefix (this app is India-only) plus a hard 10-digit cap enforced at
// the input level, not just on submit, so a pasted or fast-typed string
// can't exceed a real mobile number's length before validation ever runs.
export function PhoneInput({ className, value, onChange, disabled, ...props }: PhoneInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
    onChange(e);
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <span className={styles.prefix}>+91</span>
      <input
        {...props}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={styles.input}
      />
    </div>
  );
}
