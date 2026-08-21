import { rules, validateForm, type FormErrors } from "@/lib/validation";

export interface VendorFormData {
  name: string; company: string; gstin: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; notes: string; isActive: boolean;
}

export const BLANK_VENDOR_FORM: VendorFormData = {
  name: "", company: "", gstin: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", notes: "", isActive: true,
};

type VendorStrFields = { name: string; company: string; gstin: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; [key: string]: string; };

// State drives CGST+SGST-vs-IGST on every purchase bill from this vendor (deriveIsInterState) —
// without it a vendor would silently get the wrong GST split.
export function validateVendorForm(form: VendorFormData, opts: { requirePhone: boolean; requireAddress: boolean; requireCity: boolean; requireState: boolean; requirePincode: boolean }): FormErrors<VendorStrFields> {
  const strForm: VendorStrFields = { name: form.name, company: form.company, gstin: form.gstin, phone: form.phone, email: form.email, address: form.address, city: form.city, state: form.state, pincode: form.pincode };
  return validateForm(strForm, {
    name:    [rules.required("Vendor name is required."), rules.minLength(2), rules.maxLength(200)],
    phone:   opts.requirePhone ? [rules.required("Phone number is required."), rules.phone10()] : [rules.phone10()],
    email:   [rules.maxLength(254), rules.email()],
    gstin:   [rules.maxLength(15), rules.gstin()],
    address: (opts.requireAddress ? [rules.required("Address is required.")] : []).concat([rules.minLength(5), rules.maxLength(500)]),
    city:    (opts.requireCity ? [rules.required("City is required.")] : []).concat([rules.minLength(2), rules.maxLength(100)]),
    state:   opts.requireState ? [rules.required("State is required.")] : [],
    pincode: opts.requirePincode ? [rules.required("Pincode is required."), rules.pincode()] : [rules.pincode()],
  });
}

export function normalizeVendorField(name: string, value: string): string {
  if (name === "phone") return value.replace(/\D/g, "").slice(0, 10);
  if (name === "pincode") return value.replace(/\D/g, "").slice(0, 6);
  return value;
}
