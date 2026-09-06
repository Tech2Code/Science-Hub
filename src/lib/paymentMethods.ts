// Shared by every "Record Payment" form (invoice, purchase bill, and the standalone
// RecordPaymentDialog used by New Purchase Bill) so the method list and the "Other" custom-text
// behavior can't drift between them. Payment.method/PurchasePayment.method are plain free-text
// columns with no DB-level enum, so picking "Other" simply stores whatever the user typed in
// place of the literal word "Other" — the same field, no schema change needed.
export const PAYMENT_METHODS = ["Cash", "UPI", "IMPS", "NEFT", "RTGS", "Cheque", "Card", "Other"] as const;

const STANDARD_METHODS: readonly string[] = PAYMENT_METHODS;

// What the <Select> should show for a given stored method value — "Other" for any value that
// isn't one of the standard options (i.e. a previously-entered custom label).
export function methodSelectValue(method: string): string {
  return STANDARD_METHODS.includes(method) ? method : "Other";
}

// The custom-text field's initial value for a given stored method value.
export function methodCustomText(method: string): string {
  return STANDARD_METHODS.includes(method) ? "" : method;
}

// The actual value to persist: the typed custom label when "Other" is selected, else the
// selected standard method as-is.
export function resolvePaymentMethod(selected: string, customText: string): string {
  return selected === "Other" ? customText.trim() : selected;
}
