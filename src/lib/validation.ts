// Common validators — each returns an error string or null.
// All validators treat empty/blank as valid unless `rules.required` is included.

export type Validator = (value: string) => string | null;

export const rules = {
  required: (msg = "This field is required."): Validator =>
    (v) => v.trim() ? null : msg,

  email: (msg = "Enter a valid email address."): Validator =>
    (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : msg,

  phone10: (msg = "Enter a valid 10-digit phone number."): Validator =>
    (v) => !v.trim() || /^\d{10}$/.test(v.trim()) ? null : msg,

  minLength: (n: number, msg?: string): Validator =>
    (v) => !v || v.length >= n ? null : (msg ?? `Must be at least ${n} characters.`),

  maxLength: (n: number, msg?: string): Validator =>
    (v) => !v || v.length <= n ? null : (msg ?? `Must be at most ${n} characters.`),

  gstin: (msg = "GSTIN must be 15 alphanumeric characters."): Validator =>
    (v) => !v.trim() || /^[0-9A-Z]{15}$/i.test(v.trim()) ? null : msg,

  pincode: (msg = "Enter a valid 6-digit pincode."): Validator =>
    (v) => !v.trim() || /^\d{6}$/.test(v.trim()) ? null : msg,

  positiveNumber: (msg = "Enter a value greater than 0."): Validator =>
    (v) => !v.trim() || (parseFloat(v) > 0) ? null : msg,

  nonNegativeNumber: (msg = "Value must be 0 or more."): Validator =>
    (v) => !v.trim() || (parseFloat(v) >= 0) ? null : msg,

  passwordMatch: (other: string, msg = "Passwords do not match."): Validator =>
    (v) => v === other ? null : msg,
};

// Run a list of validators in order, return the first error or null.
export function validate(value: string, ...validators: Validator[]): string | null {
  for (const fn of validators) {
    const err = fn(value);
    if (err) return err;
  }
  return null;
}

// Validate a whole form object against a schema.
// Returns a partial record of field → error string.
export type FormErrors<T> = Partial<Record<keyof T, string>>;

export function validateForm<T extends Record<string, string>>(
  form: T,
  schema: { [K in keyof T]?: Validator[] }
): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const key in schema) {
    const validators = schema[key];
    if (!validators) continue;
    const err = validate(form[key] ?? "", ...validators);
    if (err) (errors as Record<string, string>)[key] = err;
  }
  return errors;
}

export function hasErrors<T>(errors: FormErrors<T>): boolean {
  return Object.values(errors).some(Boolean);
}
