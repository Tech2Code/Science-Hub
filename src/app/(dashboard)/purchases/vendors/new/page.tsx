"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { VendorFormFields } from "@/components/vendors/VendorFormFields";
import { BLANK_VENDOR_FORM, validateVendorForm, normalizeVendorField, type VendorFormData } from "@/lib/vendorForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import styles from "./vendorNew.module.css";

export default function NewVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<VendorFormData>(BLANK_VENDOR_FORM);
  const [errors, setErrors] = useState<ReturnType<typeof validateVendorForm>>({});
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const nextValue = normalizeVendorField(name, value);
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : nextValue }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateVendorForm(form, { requirePhone: true, requireAddress: true });
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
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: "New Vendor" }]} />
      <h1 className="page-title">New Vendor</h1>

      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <VendorFormFields form={form} onChange={handleChange} errors={errors} phoneRequired addressRequired autoFocusName />

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
