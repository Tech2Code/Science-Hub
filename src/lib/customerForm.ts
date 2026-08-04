import { rules, validateForm, type FormErrors } from "@/lib/validation";

export interface CustomerFormData {
  name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string;
  [key: string]: string;
}

export const BLANK_CUSTOMER_FORM: CustomerFormData = {
  name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "",
};

// Phone/address/city/state/pincode are required on both create and edit.
// City/state are required alongside pincode (not just format-checked)
// because they're what pincode auto-fill actually resolves, and — as with
// vendors — a customer with no state can't have its place-of-supply
// prefilled on invoices.
export function validateCustomerForm(form: CustomerFormData, opts: { requirePhone: boolean; requireAddress: boolean; requireCity: boolean; requireState: boolean; requirePincode: boolean }): FormErrors<CustomerFormData> {
  return validateForm(form, {
    name:    [rules.required("Customer name is required.")],
    phone:   opts.requirePhone ? [rules.required("Phone number is required."), rules.phone10()] : [rules.phone10()],
    email:   [rules.email()],
    address: opts.requireAddress ? [rules.required("Address is required.")] : [],
    city:    opts.requireCity ? [rules.required("City is required.")] : [],
    state:   opts.requireState ? [rules.required("State is required.")] : [],
    pincode: opts.requirePincode ? [rules.required("Pincode is required."), rules.pincode()] : [rules.pincode()],
    gstin:   [rules.maxLength(15), rules.gstin()],
  });
}

export function normalizeCustomerField(name: string, value: string): string {
  if (name === "phone") return value.replace(/\D/g, "").slice(0, 10);
  if (name === "pincode") return value.replace(/\D/g, "").slice(0, 6);
  return value;
}
