import { rules, validateForm, type FormErrors } from "@/lib/validation";

export interface VendorFormData {
  name: string; company: string; gstin: string; phone: string; email: string; address: string; notes: string; isActive: boolean;
}

export const BLANK_VENDOR_FORM: VendorFormData = {
  name: "", company: "", gstin: "", phone: "", email: "", address: "", notes: "", isActive: true,
};

type VendorStrFields = { name: string; company: string; gstin: string; phone: string; email: string; address: string; [key: string]: string; };

// Phone + address are required when creating a vendor, but optional (format-only)
// on edit — an existing vendor may predate the requirement.
export function validateVendorForm(form: VendorFormData, opts: { requirePhone: boolean; requireAddress: boolean }): FormErrors<VendorStrFields> {
  const strForm: VendorStrFields = { name: form.name, company: form.company, gstin: form.gstin, phone: form.phone, email: form.email, address: form.address };
  return validateForm(strForm, {
    name:    [rules.required("Vendor name is required.")],
    phone:   opts.requirePhone ? [rules.required("Phone number is required."), rules.phone10()] : [rules.phone10()],
    email:   [rules.email()],
    gstin:   [rules.maxLength(15), rules.gstin()],
    address: opts.requireAddress ? [rules.required("Address is required.")] : [],
  });
}

export function normalizeVendorField(name: string, value: string): string {
  return name === "phone" ? value.replace(/\D/g, "").slice(0, 10) : value;
}
