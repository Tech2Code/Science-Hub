import { rules, validateForm, type FormErrors } from "@/lib/validation";

export interface CustomerFormData {
  name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string; creditLimit: string;
  [key: string]: string;
}

export const BLANK_CUSTOMER_FORM: CustomerFormData = {
  name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "", creditLimit: "",
};

// City/state required alongside pincode (not just format-checked) — pincode auto-fill resolves them,
// and a customer with no state can't have its place-of-supply prefilled on invoices.
export function validateCustomerForm(form: CustomerFormData, opts: { requirePhone: boolean; requireAddress: boolean; requireCity: boolean; requireState: boolean; requirePincode: boolean }): FormErrors<CustomerFormData> {
  return validateForm(form, {
    name:    [rules.required("Customer name is required."), rules.minLength(2), rules.maxLength(200)],
    phone:   opts.requirePhone ? [rules.required("Phone number is required."), rules.phone10()] : [rules.phone10()],
    email:   [rules.maxLength(254), rules.email()],
    address: (opts.requireAddress ? [rules.required("Address is required.")] : []).concat([rules.minLength(5), rules.maxLength(500)]),
    city:    (opts.requireCity ? [rules.required("City is required.")] : []).concat([rules.minLength(2), rules.maxLength(100)]),
    state:   opts.requireState ? [rules.required("State is required.")] : [],
    pincode: opts.requirePincode ? [rules.required("Pincode is required."), rules.pincode()] : [rules.pincode()],
    gstin:   [rules.maxLength(15), rules.gstin()],
    creditLimit: [rules.nonNegativeNumber("Credit limit must be 0 or more.")],
  });
}

export function normalizeCustomerField(name: string, value: string): string {
  if (name === "phone") return value.replace(/\D/g, "").slice(0, 10);
  if (name === "pincode") return value.replace(/\D/g, "").slice(0, 6);
  return value;
}
