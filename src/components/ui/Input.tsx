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
      // Custom calendar dropdown — see DatePicker.tsx. onClick (used to force the native picker open) is irrelevant here.
      return <DateInput ref={ref} sz={sz} className={className} {...props} />;
    }
    const cls = [styles.input, mono && styles.mono, sz === "sm" && styles.sm, className]
      .filter(Boolean).join(" ");
    // Scrolling over a focused number input silently changes its value in Chrome/Firefox — blur on wheel (preventDefault is ignored by React's passive listener) to avoid it.
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
  hintSuccess?: boolean;
  error?: string;
  children: React.ReactNode;
  // When children isn't a single cloneable element, auto-id injection can't find a control — pass the same id here and on the actual control instead.
  id?: string;
}
export function FormField({ label, required, hint, hintSuccess, error, children, id }: FieldProps) {
  const generatedId = useId();
  const child = !id && React.isValidElement(children)
    ? (children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>)
    : null;
  const fieldId = id || child?.props.id || generatedId;
  // aria-describedby announces the error/hint on focus, not just at the moment it first appears (role="alert" only covers that one moment).
  const describedById = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  const content = child ? React.cloneElement(child, { id: fieldId, "aria-describedby": describedById }) : children;

  return (
    <div className={styles.field} {...(error ? { "data-error": "" } : {})}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {content}
      {error && (
        <p id={`${fieldId}-error`} className={styles.errorMsg} role="alert">
          <svg className={styles.errorIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.75v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="10.75" r="0.875" fill="currentColor" />
          </svg>
          {error}
        </p>
      )}
      {!error && hint && <p id={`${fieldId}-hint`} className={`${styles.hint} ${hintSuccess ? styles.hintSuccess : ""}`}>{hint}</p>}
    </div>
  );
}
