"use client";

import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { INDIA_STATES_FULL } from "@/lib/states";
import type { VendorFormData } from "@/lib/vendorForm";
import type { FormErrors } from "@/lib/validation";
import styles from "./VendorFormFields.module.css";

interface VendorFormFieldsProps {
  form: VendorFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  errors: FormErrors<{ name: string; company: string; gstin: string; phone: string; email: string; address: string }>;
  disabled?: boolean;
  phoneRequired?: boolean;
  addressRequired?: boolean;
  autoFocusName?: boolean;
}

// Name/company/phone/email/GSTIN/address/notes/active fields — shared by the
// New Vendor and Edit Vendor pages so the two forms can't drift apart.
export function VendorFormFields({ form, onChange, errors, disabled, phoneRequired, addressRequired, autoFocusName }: VendorFormFieldsProps) {
  return (
    <>
      <div className="form-grid-2">
        <FormField label="Vendor Name" required error={errors.name}>
          <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. Lab Supplies Co." autoFocus={autoFocusName} disabled={disabled} />
        </FormField>
        <FormField label="Company / Trade Name">
          <Input name="company" value={form.company} onChange={onChange} placeholder="e.g. Lab Supplies Pvt. Ltd." disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Phone" required={phoneRequired} error={errors.phone}>
          <PhoneInput name="phone" value={form.phone} onChange={onChange} placeholder="10-digit mobile" disabled={disabled} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input name="email" type="email" value={form.email} onChange={onChange} placeholder="vendor@example.com" disabled={disabled} />
        </FormField>
      </div>

      <FormField label="GSTIN" hint="Leave blank if unregistered." error={errors.gstin}>
        <Input name="gstin" value={form.gstin} onChange={onChange} placeholder="15-character GST number" maxLength={15} mono disabled={disabled} />
      </FormField>

      <FormField label="Address" required={addressRequired} error={errors.address}>
        <Textarea name="address" rows={2} value={form.address} onChange={onChange} placeholder="Street, city…" disabled={disabled} />
      </FormField>

      <FormField label="State">
        <Select name="state" value={form.state} onChange={onChange} disabled={disabled}>
          <option value="">Select state</option>
          {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </FormField>

      <FormField label="Notes">
        <Textarea name="notes" rows={2} value={form.notes} onChange={onChange} placeholder="Any additional notes about this vendor…" disabled={disabled} />
      </FormField>

      <label className={styles.checkboxLabel}>
        <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} className={styles.checkboxInput} disabled={disabled} />
        Active vendor
      </label>
    </>
  );
}
