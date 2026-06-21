import styles from "./Input.module.css";

/* ── Input ─────────────────────────────────── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  sz?: "sm" | "md";
}
export function Input({ mono, sz, className, ...props }: InputProps) {
  const cls = [styles.input, mono && styles.mono, sz === "sm" && styles.sm, className]
    .filter(Boolean).join(" ");
  return <input className={cls} {...props} />;
}

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
  children: React.ReactNode;
}
export function FormField({ label, required, hint, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
