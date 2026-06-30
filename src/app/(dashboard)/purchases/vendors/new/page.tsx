"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validateForm, hasErrors, type FormErrors } from "@/lib/validation";

type StrForm = { name: string; company: string; gstin: string; phone: string; email: string; };

export default function NewVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "", company: "", gstin: "", phone: "", email: "", address: "", notes: "", isActive: true,
  });
  const [errors, setErrors] = useState<FormErrors<StrForm>>({});
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const strForm: StrForm = { name: form.name, company: form.company, gstin: form.gstin, phone: form.phone, email: form.email };
    const newErrors = validateForm(strForm, {
      name:  [rules.required("Vendor name is required.")],
      phone: [rules.phone10()],
      email: [rules.email()],
      gstin: [rules.maxLength(15), rules.gstin()],
    });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({});
    setSaving(true);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/vendors");
      toast({ type: "success", title: "Vendor created", message: `"${form.name}" added.` });
      router.push("/purchases/vendors");
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to create vendor." });
    }
  }

  return (
    <>
    {saving && <OverlayLoader text="Creating vendor…" />}
    <div className="page-stack" style={{ maxWidth: "42rem" }}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: "New Vendor" }]} />
      <h1 className="page-title">New Vendor</h1>

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <FormField label="Vendor Name" required error={errors.name as string}>
            <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Lab Supplies Co." autoFocus />
          </FormField>
          <FormField label="Company / Trade Name">
            <Input name="company" value={form.company} onChange={handleChange} placeholder="e.g. Lab Supplies Pvt. Ltd." />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Phone" error={errors.phone as string}>
            <Input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="10-digit mobile" />
          </FormField>
          <FormField label="Email" error={errors.email as string}>
            <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="vendor@example.com" />
          </FormField>
        </div>

        <FormField label="GSTIN" hint="Leave blank if unregistered." error={errors.gstin as string}>
          <Input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-character GST number" maxLength={15} mono />
        </FormField>

        <FormField label="Address">
          <Textarea name="address" rows={2} value={form.address} onChange={handleChange} placeholder="Street, city, state…" />
        </FormField>

        <FormField label="Notes">
          <Textarea name="notes" rows={2} value={form.notes} onChange={handleChange} placeholder="Any additional notes about this vendor…" />
        </FormField>

        <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--c-text-2)", fontWeight: 500 }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "1rem", height: "1rem", accentColor: "var(--c-blue)", cursor: "pointer" }} />
          Active vendor
        </label>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Create Vendor
          </Button>
          <Button variant="secondary" href="/purchases/vendors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </Button>
        </div>
      </form>
    </div>
    </>
  );
}
