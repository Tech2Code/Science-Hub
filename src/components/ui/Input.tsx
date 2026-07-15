"use client";

import React, { useId } from "react";
import styles from "./Input.module.css";
import { DateInput } from "./DatePicker";
export { Select } from "./Select";

/* ── Input ─────────────────────────────────── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  sz?: "sm" | "md";
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ mono, sz, className, type, onWheel, onClick, ...props }, ref) {
    if (type === "date") {
      // Custom calendar dropdown — see DatePicker.tsx. onClick was only ever
      // used to force the native picker open; irrelevant once there's no
      // native picker to open.
      return <DateInput ref={ref} sz={sz} className={className} {...props} />;
    }
    const cls = [styles.input, mono && styles.mono, sz === "sm" && styles.sm, className]
      .filter(Boolean).join(" ");
    // Scrolling the page with the cursor over a focused number input silently
    // increments/decrements its value in Chrome/Firefox — blurring on wheel
    // (rather than preventDefault, which React's passive wheel listener
    // ignores) is the standard workaround so mouse-wheel scroll never edits
    // a number field by accident.
    const handleWheel = type === "number"
      ? (e: React.WheelEvent<HTMLInputElement>) => { onWheel?.(e); e.currentTarget.blur(); }
      : onWheel;
    return <input ref={ref} type={type} className={cls} onWheel={handleWheel} onClick={onClick} {...props} />;
  }
);

/* ── Textarea ──────────────────────────────── */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  sz?: "sm" | "md";
}
export function Textarea({ sz, className, ...props }: TextareaProps) {
  const cls = [styles.textarea, sz === "sm" && styles.sm, className].filter(Boolean).join(" ");
  return <textarea className={cls} {...props} />;
}

/* ── FormField wrapper ─────────────────────── */
interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}
export function FormField({ label, required, hint, error, children }: FieldProps) {
  const generatedId = useId();
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<{ id?: string }>)
    : null;
  const fieldId = child?.props.id || generatedId;
  const content = child ? React.cloneElement(child, { id: fieldId }) : children;

  return (
    <div className={styles.field} {...(error ? { "data-error": "" } : {})}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {content}
      {error && (
        <p className={styles.errorMsg} role="alert">
          <svg className={styles.errorIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.75v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="10.75" r="0.875" fill="currentColor" />
          </svg>
          {error}
        </p>
      )}
      {!error && hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
