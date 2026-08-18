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

  docPrefix: (msg = "Prefix must be 2-6 letters/numbers (e.g. SH)."): Validator =>
    (v) => !v.trim() || /^[A-Z0-9]{2,6}$/i.test(v.trim()) ? null : msg,

  positiveInteger: (msg = "Enter a whole number greater than 0."): Validator =>
    (v) => !v.trim() || (/^\d+$/.test(v.trim()) && parseInt(v.trim(), 10) > 0) ? null : msg,
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
// `requireContactDetails` is set on create, edit, and the invoice page's
// inline "custom customer" flow alike. State is required alongside pincode
// since it's what pincode auto-fill resolves, mirroring the same
// requirement on vendors.
export function validateCustomerInput(input: {
  name?: string; phone?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string; gstin?: string;
}, requireContactDetails = false): string | null {
  const name = (input.name ?? "").trim();
  if (!name) return "Name is required.";
  if (name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 200) return "Name is too long (max 200 characters).";
  if (requireContactDetails) {
    if (!(input.address ?? "").trim()) return "Address is required.";
    if (!(input.city ?? "").trim()) return "City is required.";
    if (!(input.state ?? "").trim()) return "State is required.";
    if (!(input.pincode ?? "").trim()) return "Pincode is required.";
  }
  return (
    validate(input.phone ?? "", rules.phone10()) ||
    validate(input.email ?? "", rules.maxLength(254), rules.email()) ||
    validate(input.address ?? "", rules.minLength(5), rules.maxLength(500)) ||
    validate(input.city ?? "", rules.minLength(2), rules.maxLength(100)) ||
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
  input: { name?: string; price?: unknown; sku?: string; hsn?: string; description?: string },
  requireCore = false
): string | null {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (requireCore) {
    if (!name || input.price === undefined) return "Name and price are required.";
  } else if (input.name !== undefined && !name) {
    return "Name cannot be blank";
  }
  if (name && name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 200) return "Name is too long (max 200 characters).";
  return (
    validate(input.sku ?? "", rules.maxLength(50)) ||
    validate(input.hsn ?? "", rules.maxLength(50)) ||
    validate(input.description ?? "", rules.maxLength(2000)) ||
    null
  );
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
  if (input.name !== undefined && (input.name.trim().length < 2 || input.name.length > 200)) {
    return "Name must be between 2 and 200 characters";
  }
  if (input.email !== undefined) {
    const err = validate(input.email, rules.required("Email is required."), rules.maxLength(254), rules.email());
    if (err) return err;
  }
  if (input.password !== undefined && input.password.length > 72) {
    return `${passwordLabel} must be at most 72 characters`;
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
// `isBankSectionUpdate` must be true only when the request actually intends
// to write the bank details section (i.e. the incoming body contains at
// least one bank key) — otherwise a save of an unrelated section (identity,
// address, terms, ...) would re-validate bank fields it never touched, and
// fail if the account number couldn't be decrypted for an unrelated reason
// (e.g. a NEXTAUTH_SECRET mismatch) rather than because it's actually blank.
export function validateSettingsInput(input: {
  name?: string; tagline?: string; email?: string; gmailUser?: string;
  pan?: string; termsAndConditions?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string; gstin?: string;
  bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIfsc?: string; bankBranch?: string;
}, isBankSectionUpdate: boolean, isAddressSectionUpdate = false): string | null {
  return (
    validate(input.name ?? "", rules.minLength(2), rules.maxLength(200)) ||
    validate(input.tagline ?? "", rules.maxLength(100)) ||
    validate(input.email ?? "", rules.maxLength(254), rules.email()) ||
    validate(input.gmailUser ?? "", rules.maxLength(254), rules.email()) ||
    validate(input.pan ?? "", rules.maxLength(10), rules.pan()) ||
    validate(input.termsAndConditions ?? "", rules.maxLength(2000)) ||
    validate(input.phone ?? "", rules.phone10()) ||
    (isAddressSectionUpdate ? validate(input.address ?? "", rules.required("Street address is required.")) : null) ||
    (isAddressSectionUpdate ? validate(input.city ?? "", rules.required("City is required.")) : null) ||
    (isAddressSectionUpdate ? validate(input.state ?? "", rules.required("State is required.")) : null) ||
    (isAddressSectionUpdate ? validate(input.pincode ?? "", rules.required("Pincode is required.")) : null) ||
    validate(input.address ?? "", rules.minLength(5), rules.maxLength(500)) ||
    validate(input.city ?? "", rules.minLength(2), rules.maxLength(100)) ||
    validate(input.pincode ?? "", rules.pincode()) ||
    validate(input.gstin ?? "", rules.maxLength(15), rules.gstin()) ||
    (isBankSectionUpdate
      ? validate(input.bankName ?? "", rules.required("Bank name is required."), rules.minLength(2), rules.maxLength(200)) ||
        validate(input.bankAccountName ?? "", rules.required("Account holder name is required."), rules.minLength(2), rules.maxLength(200)) ||
        validate(input.bankBranch ?? "", rules.required("Branch is required."), rules.minLength(2), rules.maxLength(100)) ||
        validate(input.bankAccountNumber ?? "", rules.required("Account number is required."), rules.accountNumber()) ||
        validate(input.bankIfsc ?? "", rules.required("IFSC code is required."), rules.ifsc())
      : null) ||
    null
  );
}

// Server-side counterpart to the rate-list form's client-side validation.
export function validateRateListInput(input: { title?: string; note?: string }): string | null {
  const title = (input.title ?? "").trim();
  if (!title) return "Title is required.";
  if (title.length < 2) return "Title must be at least 2 characters.";
  if (title.length > 200) return "Title is too long (max 200 characters).";
  if ((input.note ?? "").length > 2000) return "Note is too long (max 2000 characters).";
  return null;
}

// Server-side counterpart to the vendor form's client-side validation —
// API route handlers must not rely solely on the browser to enforce this.
// `requireContactDetails` is set on both creation and edit — a vendor with
// no state can't have its place-of-supply derived correctly on purchase
// bills (see deriveIsInterState), so editing an existing vendor is also a
// chance to backfill the missing contact/address details rather than
// letting them persist indefinitely.
export function validateVendorInput(input: {
  name?: string; company?: string; phone?: string; email?: string; gstin?: string; address?: string; city?: string; state?: string; pincode?: string; notes?: string;
}, requireContactDetails = false): string | null {
  const name = (input.name ?? "").trim();
  if (!name) return "Vendor name is required.";
  if (name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 200) return "Name is too long (max 200 characters).";
  if (requireContactDetails) {
    if (!(input.address ?? "").trim()) return "Address is required.";
    if (!(input.city ?? "").trim()) return "City is required.";
    if (!(input.state ?? "").trim()) return "State is required.";
    if (!(input.pincode ?? "").trim()) return "Pincode is required.";
  }
  return (
    validate(input.company ?? "", rules.maxLength(200)) ||
    validate(input.phone ?? "", rules.phone10()) ||
    validate(input.email ?? "", rules.maxLength(254), rules.email()) ||
    validate(input.gstin ?? "", rules.maxLength(15), rules.gstin()) ||
    validate(input.address ?? "", rules.minLength(5), rules.maxLength(500)) ||
    validate(input.city ?? "", rules.minLength(2), rules.maxLength(100)) ||
    validate(input.pincode ?? "", rules.pincode()) ||
    validate(input.notes ?? "", rules.maxLength(2000)) ||
    null
  );
}
