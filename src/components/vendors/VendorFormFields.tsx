"use client";

import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import type { VendorFormData } from "@/lib/vendorForm";
import type { FormErrors } from "@/lib/validation";
import styles from "./VendorFormFields.module.css";

interface VendorFormFieldsProps {
  form: VendorFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  errors: FormErrors<{ name: string; company: string; gstin: string; phone: string; email: string; address: string; city: string; state: string; pincode: string }>;
  disabled?: boolean;
  phoneRequired?: boolean;
  addressRequired?: boolean;
  cityRequired?: boolean;
  stateRequired?: boolean;
  pincodeRequired?: boolean;
  autoFocusName?: boolean;
}

function fireChange(onChange: VendorFormFieldsProps["onChange"], name: string, value: string) {
  onChange({ target: { name, value } } as React.ChangeEvent<HTMLInputElement>);
}

// Name/company/address/pincode/state/city/GSTIN/phone/email/notes/active
// fields — shared by the New Vendor and Edit Vendor pages so the two forms
// can't drift apart. Field order mirrors the "Add New Vendor" quick-add
// popup in purchase bill creation (BillDetailsCard.tsx) so both flows feel
// identical.
export function VendorFormFields({ form, onChange, errors, disabled, phoneRequired, addressRequired, cityRequired, stateRequired, pincodeRequired, autoFocusName }: VendorFormFieldsProps) {
  const pincodeLookup = usePincodeAutofill((city, state) => {
    if (city) fireChange(onChange, "city", city);
    if (state) fireChange(onChange, "state", state);
  });

  function handlePincodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e);
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (digits.length === 6) pincodeLookup.run(digits);
    else pincodeLookup.reset();
  }

  return (
    <>
      <div className="form-grid-2">
        <FormField label="Vendor Name" required error={errors.name}>
          <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. Lab Supplies Co." autoFocus={autoFocusName} disabled={disabled} maxLength={200} />
        </FormField>
        <FormField label="Company / Trade Name">
          <Input name="company" value={form.company} onChange={onChange} placeholder="e.g. Lab Supplies Pvt. Ltd." disabled={disabled} maxLength={200} />
        </FormField>
      </div>

      <FormField label="Address" required={addressRequired} error={errors.address}>
        <Input name="address" value={form.address} onChange={onChange} placeholder="Street, city…" disabled={disabled} maxLength={500} />
      </FormField>

      <div className="form-grid-2">
        <FormField
          label="Pincode"
          required={pincodeRequired}
          error={errors.pincode}
          hint={pincodeLookup.status.status === "loading" ? "Looking up city/state…" : pincodeLookup.status.label}
          hintSuccess={pincodeLookup.status.status === "found"}
        >
          <Input name="pincode" value={form.pincode} onChange={handlePincodeChange} placeholder="6-digit PIN" maxLength={6} disabled={disabled} />
        </FormField>
        <FormField label="State" required={stateRequired} error={errors.state}>
          <Select name="state" value={form.state} onChange={onChange} disabled={disabled}>
            <option value="">Select state</option>
            {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="City" required={cityRequired} error={errors.city}>
          <Input name="city" value={form.city} onChange={onChange} placeholder="City" disabled={disabled} maxLength={100} />
        </FormField>
        <FormField label="GSTIN" hint="Leave blank if vendor is unregistered." error={errors.gstin}>
          <Input name="gstin" value={form.gstin} onChange={onChange} placeholder="15-character GST number" maxLength={15} mono disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Phone" required={phoneRequired} error={errors.phone}>
          <PhoneInput name="phone" value={form.phone} onChange={onChange} placeholder="10-digit mobile" disabled={disabled} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input name="email" type="email" value={form.email} onChange={onChange} placeholder="vendor@example.com" disabled={disabled} maxLength={254} />
        </FormField>
      </div>

      <FormField label="Notes">
        <Textarea name="notes" rows={2} value={form.notes} onChange={onChange} placeholder="Any additional notes about this vendor…" disabled={disabled} maxLength={2000} />
      </FormField>

      <label className={styles.checkboxLabel}>
        <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} className={styles.checkboxInput} disabled={disabled} />
        Active vendor
      </label>
    </>
  );
}
