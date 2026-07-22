// Common validators — each returns an error string or null.
// All validators treat empty/blank as valid unless `rules.required` is included.

export type Validator = (value: string) => string | null;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Payment/return date fields arrive as a plain "YYYY-MM-DD" string with no
// timezone info, representing "today" in the business's own calendar (this
// app is India-only). Comparing the UTC-midnight-parsed Date against the
// exact server clock (Date.now()) falsely flags "today" as a future date
// for the first ~5.5 hours of every IST day, since that day's UTC midnight
// hasn't arrived yet. Comparing calendar-date strings in IST avoids that.
export function isFutureIstDate(dateStr: string): boolean {
  const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return dateStr > todayIst;
}

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

  pan: (msg = "Enter a valid 10-character PAN (e.g. AAAAA0000A)."): Validator =>
    (v) => !v.trim() || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(v.trim()) ? null : msg,

  ifsc: (msg = "Enter a valid 11-character IFSC code."): Validator =>
    (v) => !v.trim() || /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.trim()) ? null : msg,

  accountNumber: (msg = "Enter a valid account number (9-18 digits)."): Validator =>
    (v) => !v.trim() || /^\d{9,18}$/.test(v.trim()) ? null : msg,

  pincode: (msg = "Enter a valid 6-digit pincode."): Validator =>
    (v) => !v.trim() || /^\d{6}$/.test(v.trim()) ? null : msg,

  positiveNumber: (msg = "Enter a value greater than 0."): Validator =>
    (v) => !v.trim() || (parseFloat(v) > 0) ? null : msg,

  nonNegativeNumber: (msg = "Value must be 0 or more."): Validator =>
    (v) => !v.trim() || (parseFloat(v) >= 0) ? null : msg,

  passwordMatch: (other: string, msg = "Passwords do not match."): Validator =>
    (v) => v === other ? null : msg,

  // Looser than phone10 — allows an optional country code/format like "+91-9968597044".
  phoneFlexible: (msg = "Enter a valid phone number."): Validator =>
    (v) => !v.trim() || /^\+?[\d\s-]{7,20}$/.test(v.trim()) ? null : msg,
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

// Server-side counterpart to the customer form's client-side validation —
// API route handlers must not rely solely on the browser to enforce this.
export function validateCustomerInput(input: {
  name?: string; phone?: string; email?: string; pincode?: string; gstin?: string;
}): string | null {
  const name = (input.name ?? "").trim();
  if (!name) return "Name is required.";
  if (name.length > 200) return "Name is too long (max 200 characters).";
  return (
    validate(input.phone ?? "", rules.phone10()) ||
    validate(input.email ?? "", rules.email()) ||
    validate(input.pincode ?? "", rules.pincode()) ||
    validate(input.gstin ?? "", rules.gstin()) ||
    null
  );
}

// Generic numeric field check shared by product create/update routes —
// mirrors the shape of a single `rules.*` validator but works on an
// already-parsed number instead of a raw string.
export function validateNumericField(
  key: string,
  value: number,
  opts: { min?: number; max?: number; integer?: boolean } = {}
): string | null {
  const { min = -Infinity, max = Infinity, integer = false } = opts;
  if (Number.isNaN(value)) return `${key} must be a valid number`;
  if (value < min || value > max) {
    return `${key} must be between ${min === -Infinity ? "-∞" : min} and ${max === Infinity ? "∞" : max}`;
  }
  if (integer && !Number.isInteger(value)) return `${key} must be a whole number`;
  return null;
}

// Server-side counterpart to the product form's client-side validation —
// only covers the non-numeric "core" fields; numeric fields are checked
// with `validateNumericField` since routes parse them differently
// (create applies defaults, update validates only supplied fields).
export function validateProductInput(
  input: { name?: string; price?: unknown },
  requireCore = false
): string | null {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (requireCore) {
    if (!name || input.price === undefined) return "Name and price are required.";
  } else if (input.name !== undefined && !name) {
    return "Name cannot be blank";
  }
  return null;
}

// Server-side counterpart to the admin user form's client-side validation —
// each field is checked only when present in `input`, so the same function
// covers both full create and partial update.
export function validateUserInput(
  input: { name?: string; email?: string; password?: string; role?: string },
  opts: { requireAll?: boolean; passwordLabel?: string } = {}
): string | null {
  const { requireAll = false, passwordLabel = "Password" } = opts;
  if (requireAll && (!input.name || !input.email || !input.password || !input.role)) {
    return "name, email, password, and role are required";
  }
  if (input.name !== undefined && (input.name.trim().length === 0 || input.name.length > 200)) {
    return "Name must be between 1 and 200 characters";
  }
  if (input.email !== undefined) {
    const err = validate(input.email, rules.required("Email is required."), rules.email());
    if (err) return err;
  }
  if (input.password !== undefined && input.password.length < 8) {
    return `${passwordLabel} must be at least 8 characters`;
  }
  if (input.role !== undefined && input.role !== "admin" && input.role !== "staff" && input.role !== "manager") {
    return 'role must be "admin", "staff", or "manager"';
  }
  return null;
}

// Server-side counterpart to the settings form's client-side validation.
export function validateSettingsInput(input: {
  pan?: string; termsAndConditions?: string; phone?: string; pincode?: string; gstin?: string;
  bankName?: string; bankAccountNumber?: string; bankIfsc?: string; bankBranch?: string;
}): string | null {
  const bankConfigured = Boolean(
    input.bankName || input.bankAccountNumber || input.bankIfsc || input.bankBranch
  );
  return (
    validate(input.pan ?? "", rules.maxLength(10), rules.pan()) ||
    validate(input.termsAndConditions ?? "", rules.maxLength(2000)) ||
    validate(input.phone ?? "", rules.phoneFlexible()) ||
    validate(input.pincode ?? "", rules.pincode()) ||
    validate(input.gstin ?? "", rules.maxLength(15), rules.gstin()) ||
    (bankConfigured
      ? validate(input.bankName ?? "", rules.required("Bank name is required.")) ||
        validate(input.bankBranch ?? "", rules.required("Branch is required.")) ||
        validate(input.bankAccountNumber ?? "", rules.required("Account number is required."), rules.accountNumber()) ||
        validate(input.bankIfsc ?? "", rules.required("IFSC code is required."), rules.ifsc())
      : null) ||
    null
  );
}

// Server-side counterpart to the vendor form's client-side validation —
// API route handlers must not rely solely on the browser to enforce this.
// `requireContactDetails` is set on creation only — existing vendors may
// predate the phone/address requirement, so edits don't retroactively block on it.
export function validateVendorInput(input: {
  name?: string; phone?: string; email?: string; gstin?: string; address?: string;
}, requireContactDetails = false): string | null {
  const name = (input.name ?? "").trim();
  if (!name) return "Vendor name is required.";
  if (name.length > 200) return "Name is too long (max 200 characters).";
  if (requireContactDetails) {
    if (!(input.phone ?? "").trim()) return "Phone number is required.";
    if (!(input.address ?? "").trim()) return "Address is required.";
  }
  return (
    validate(input.phone ?? "", rules.phone10()) ||
    validate(input.email ?? "", rules.email()) ||
    validate(input.gstin ?? "", rules.maxLength(15), rules.gstin()) ||
    null
  );
}
