"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import { BLANK_CUSTOMER_FORM, validateCustomerForm, normalizeCustomerField, type CustomerFormData } from "@/lib/customerForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import styles from "./customerNew.module.css";

export default function NewCustomerPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<CustomerFormData>(BLANK_CUSTOMER_FORM);
  const [errors, setErrors] = useState<FormErrors<CustomerFormData>>({});
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: normalizeCustomerField(name, value) }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateCustomerForm(form, { requirePhone: true });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({});
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/customers");
      toast({ type: "success", title: "Customer created", message: "New customer added." });
      router.push("/sales/customers");
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to create customer." });
    }
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: "New Customer" }]} />

      <div>
        <h1 className="page-title">New Customer</h1>
        <p className="page-sub">Add a new customer to your directory</p>
      </div>

      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <CustomerFormFields form={form} onChange={handleChange} errors={errors} phoneRequired autoFocusName />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Add Customer</Button>
          <Button variant="secondary" href="/sales/customers"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
