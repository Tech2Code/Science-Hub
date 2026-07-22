"use client";

import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { INDIA_STATES_FULL } from "@/lib/states";
import type { CustomerFormData } from "@/lib/customerForm";
import type { FormErrors } from "@/lib/validation";

interface CustomerFormFieldsProps {
  form: CustomerFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  errors: FormErrors<CustomerFormData>;
  disabled?: boolean;
  phoneRequired?: boolean;
  autoFocusName?: boolean;
}

// Name/phone/email/address/city/state/pincode/GSTIN fields — shared by the
// New Customer and Edit Customer pages so the two forms can't drift apart.
export function CustomerFormFields({ form, onChange, errors, disabled, phoneRequired, autoFocusName }: CustomerFormFieldsProps) {
  return (
    <>
      <FormField label="Customer Name" required error={errors.name}>
        <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. ABC Enterprises" autoFocus={autoFocusName} disabled={disabled} />
      </FormField>

      <div className="form-grid-2">
        <FormField label="Phone" required={phoneRequired} error={errors.phone}>
          <Input name="phone" type="tel" value={form.phone} onChange={onChange} placeholder="10-digit mobile" disabled={disabled} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input name="email" type="email" value={form.email} onChange={onChange} placeholder="billing@customer.com" disabled={disabled} />
        </FormField>
      </div>

      <FormField label="Address">
        <Textarea name="address" rows={2} value={form.address} onChange={onChange} placeholder="Street address, building, floor…" disabled={disabled} />
      </FormField>

      <div className="form-grid-3">
        <FormField label="City">
          <Input name="city" value={form.city} onChange={onChange} placeholder="City" disabled={disabled} />
        </FormField>
        <FormField label="State">
          <Select name="state" value={form.state} onChange={onChange} disabled={disabled}>
            <option value="">Select state</option>
            {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>
        <FormField label="Pincode" error={errors.pincode}>
          <Input name="pincode" value={form.pincode} onChange={onChange} placeholder="6-digit PIN" maxLength={6} disabled={disabled} />
        </FormField>
      </div>

      <FormField label="GSTIN" hint="Leave blank if customer is unregistered." error={errors.gstin}>
        <Input name="gstin" value={form.gstin} onChange={onChange} placeholder="15-character GST number" maxLength={15} mono disabled={disabled} />
      </FormField>
    </>
  );
}
