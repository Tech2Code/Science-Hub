import { rules, validateForm, type FormErrors } from "@/lib/validation";

export interface CustomerFormData {
  name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string;
  [key: string]: string;
}

export const BLANK_CUSTOMER_FORM: CustomerFormData = {
  name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "",
};

// Phone is required when creating a customer, but optional (format-only) on
// edit — an existing customer may predate the requirement.
export function validateCustomerForm(form: CustomerFormData, opts: { requirePhone: boolean }): FormErrors<CustomerFormData> {
  return validateForm(form, {
    name:    [rules.required("Customer name is required.")],
    phone:   opts.requirePhone ? [rules.required("Phone number is required."), rules.phone10()] : [rules.phone10()],
    email:   [rules.email()],
    pincode: [rules.pincode()],
    gstin:   [rules.maxLength(15), rules.gstin()],
  });
}

export function normalizeCustomerField(name: string, value: string): string {
  if (name === "phone") return value.replace(/\D/g, "").slice(0, 10);
  if (name === "pincode") return value.replace(/\D/g, "").slice(0, 6);
  return value;
}
