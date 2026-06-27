import React from "react";
import styles from "./Input.module.css";

/* ── Input ─────────────────────────────────── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  sz?: "sm" | "md";
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ mono, sz, className, ...props }, ref) {
    const cls = [styles.input, mono && styles.mono, sz === "sm" && styles.sm, className]
      .filter(Boolean).join(" ");
    return <input ref={ref} className={cls} {...props} />;
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

/* ── Select ────────────────────────────────── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  sz?: "sm" | "md";
}
export function Select({ sz, className, ...props }: SelectProps) {
  const cls = [styles.select, sz === "sm" && styles.sm, className].filter(Boolean).join(" ");
  return <select className={cls} {...props} />;
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
  return (
    <div className={styles.field} {...(error ? { "data-error": "" } : {})}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {children}
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
