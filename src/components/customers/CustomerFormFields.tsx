"use client";

import { Input, Select, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import type { CustomerFormData } from "@/lib/customerForm";
import type { FormErrors } from "@/lib/validation";

interface CustomerFormFieldsProps {
  form: CustomerFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  errors: FormErrors<CustomerFormData>;
  disabled?: boolean;
  phoneRequired?: boolean;
  addressRequired?: boolean;
  cityRequired?: boolean;
  stateRequired?: boolean;
  pincodeRequired?: boolean;
  autoFocusName?: boolean;
}

function fireChange(onChange: CustomerFormFieldsProps["onChange"], name: string, value: string) {
  onChange({ target: { name, value } } as React.ChangeEvent<HTMLInputElement>);
}

// Name/address/pincode/state/city/GSTIN/phone/email fields — shared by the
// New Customer and Edit Customer pages so the two forms can't drift apart.
// Field order mirrors the "Add New Customer" quick-add popup in invoice
// creation (src/app/(dashboard)/sales/invoices/new/page.tsx) so both flows
// feel identical.
export function CustomerFormFields({ form, onChange, errors, disabled, phoneRequired, addressRequired, cityRequired, stateRequired, pincodeRequired, autoFocusName }: CustomerFormFieldsProps) {
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
      <FormField label="Customer Name" required error={errors.name}>
        <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. ABC Enterprises" autoFocus={autoFocusName} disabled={disabled} maxLength={200} />
      </FormField>

      <FormField label="Address" required={addressRequired} error={errors.address}>
        <Input name="address" value={form.address} onChange={onChange} placeholder="Street address, building, floor…" disabled={disabled} maxLength={500} />
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
        <FormField label="GSTIN" hint="Leave blank if customer is unregistered." error={errors.gstin}>
          <Input name="gstin" value={form.gstin} onChange={onChange} placeholder="15-character GST number" maxLength={15} mono disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Phone" required={phoneRequired} error={errors.phone}>
          <PhoneInput name="phone" value={form.phone} onChange={onChange} placeholder="10-digit mobile" disabled={disabled} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input name="email" type="email" value={form.email} onChange={onChange} placeholder="billing@customer.com" disabled={disabled} maxLength={254} />
        </FormField>
      </div>
    </>
  );
}
