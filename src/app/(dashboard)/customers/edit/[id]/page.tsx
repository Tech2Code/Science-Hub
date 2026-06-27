"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validateForm, hasErrors, type FormErrors } from "@/lib/validation";

const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Delhi","Jammu and Kashmir","Ladakh",
  "Lakshadweep","Puducherry",
];

export default function EditCustomerPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "",
  });
  const [initialForm, setInitialForm] = useState<typeof form | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<FormErrors<typeof form>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const loaded = { name: d.name ?? "", phone: d.phone ?? "", email: d.email ?? "",
          address: d.address ?? "", city: d.city ?? "", state: d.state ?? "",
          pincode: d.pincode ?? "", gstin: d.gstin ?? "" };
        setForm(loaded);
        setInitialForm(loaded);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load customer."); setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name } = e.target;
    let { value } = e.target;
    if (name === "phone") value = value.replace(/\D/g, "").slice(0, 10);
    if (name === "pincode") value = value.replace(/\D/g, "").slice(0, 6);
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function doSave() {
    setConfirmOpen(false); setSaving(true);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/customers");
      bustCache(`/api/customers/${id}`);
      bustCache("/api/invoices");
      toast({ type: "success", title: "Customer updated", message: "Changes saved." });
      router.push("/customers");
    }
    else { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed to update customer."); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateForm(form, {
      name:    [rules.required("Customer name is required.")],
      phone:   [rules.phone10()],
      email:   [rules.email()],
      pincode: [rules.pincode()],
      gstin:   [rules.maxLength(15), rules.gstin()],
    });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({}); setError(""); setConfirmOpen(true);
  }

  if (loading) return <div className="loading-center">Loading customer…</div>;

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack" style={{ maxWidth: "42rem" }}>
      <ConfirmDialog
        open={confirmOpen}
        title="Save Changes"
        message="Are you sure you want to update this customer's details?"
        confirmLabel="Save Changes"
        loading={saving}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: "Edit Customer" }]} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Edit Customer</h1>
          <p className="page-sub">{form.name || "—"}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer ID</span>
          <code style={{ fontSize: "0.75rem", background: "var(--c-bg-sub)", color: "var(--c-text-2)", padding: "0.25rem 0.625rem", borderRadius: "0.5rem", fontFamily: "var(--font-mono)", border: "1px solid var(--c-border)" }}>
            {id}
          </code>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <FormField label="Customer Name" required error={errors.name as string}>
          <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. ABC Enterprises" />
        </FormField>

        <div className="form-grid-2">
          <FormField label="Phone" error={errors.phone as string}>
            <Input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="10-digit mobile" />
          </FormField>
          <FormField label="Email" error={errors.email as string}>
            <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="billing@customer.com" />
          </FormField>
        </div>

        <FormField label="Address">
          <Textarea name="address" rows={2} value={form.address} onChange={handleChange} placeholder="Street address, building, floor…" />
        </FormField>

        <div className="form-grid-3">
          <FormField label="City">
            <Input name="city" value={form.city} onChange={handleChange} placeholder="City" />
          </FormField>
          <FormField label="State">
            <Select name="state" value={form.state} onChange={handleChange}>
              <option value="">Select state</option>
              {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Pincode" error={errors.pincode as string}>
            <Input name="pincode" value={form.pincode} onChange={handleChange} placeholder="6-digit PIN" maxLength={6} />
          </FormField>
        </div>

        <FormField label="GSTIN" hint="Leave blank if customer is unregistered." error={errors.gstin as string}>
          <Input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-character GST number" maxLength={15} mono />
        </FormField>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Customer</Button>
          <Button variant="secondary" href="/customers"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
