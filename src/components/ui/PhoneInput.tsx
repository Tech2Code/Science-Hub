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

// Fixed "+91" prefix + hard 10-digit cap enforced at input level (not just on submit).
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
