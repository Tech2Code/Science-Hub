"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import { BLANK_CUSTOMER_FORM, validateCustomerForm, normalizeCustomerField, type CustomerFormData } from "@/lib/customerForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import styles from "./customerEdit.module.css";

export default function EditCustomerPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [form, setForm] = useState<CustomerFormData>(BLANK_CUSTOMER_FORM);
  const [initialForm, setInitialForm] = useState<CustomerFormData | null>(null);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<FormErrors<CustomerFormData>>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${id}`, { headers: { "x-no-loader": "1" } })
      .then((r) => r.json())
      .then((d) => {
        const loaded: CustomerFormData = { name: d.name ?? "", phone: d.phone ?? "", email: d.email ?? "",
          address: d.address ?? "", city: d.city ?? "", state: d.state ?? "",
          pincode: d.pincode ?? "", gstin: d.gstin ?? "" };
        setForm(loaded);
        setInitialForm(loaded);
        setLoadedUpdatedAt(d.updatedAt ?? null);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: normalizeCustomerField(name, value) }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function doSave() {
    setConfirmOpen(false); setSaving(true);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, expectedUpdatedAt: loadedUpdatedAt }),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/customers");
      bustCache(`/api/customers/${id}`);
      bustCache("/api/invoices");
      toast({ type: "success", title: "Customer updated", message: "Changes saved." });
      router.push(`/sales/customers/${id}`);
    }
    else if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      bustCache(`/api/customers/${id}`);
      toast({ type: "error", title: "Update conflict", message: d?.error ?? "This customer was changed by someone else. Please reload and try again." });
    }
    else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update customer." }); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateCustomerForm(form, { requirePhone: false });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({}); setConfirmOpen(true);
  }

  const noChanges = initialForm !== null && JSON.stringify(form) === JSON.stringify(initialForm);
  const disabled = loading || saving;

  return (
    <>
    {loading && <OverlayLoader text="Loading customer…" />}
    {!loading && saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <ConfirmDialog
        open={confirmOpen}
        title="Save Changes"
        message="Are you sure you want to update this customer's details?"
        confirmLabel="Save Changes"
        loading={saving}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
      <Breadcrumb items={[{ label: "Customers", href: "/sales/customers" }, { label: "Edit Customer" }]} />

      <div className={styles.headerRow}>
        <div>
          <h1 className="page-title">Edit Customer</h1>
          <p className="page-sub">{form.name || "—"}</p>
        </div>
        <div className={styles.idCol}>
          <span className={styles.idLabel}>Customer ID</span>
          <code className={styles.idValue}>
            {id}
          </code>
        </div>
      </div>

      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <CustomerFormFields form={form} onChange={handleChange} errors={errors} disabled={disabled} />

        <div className="form-actions-wrap">
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={disabled || noChanges}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Customer
            </Button>
            <Button variant="secondary" href={`/sales/customers/${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
          </div>
          {!loading && noChanges && !saving && (
            <span className={styles.noChanges}>No changes detected.</span>
          )}
        </div>
      </form>
    </div>
    </>
  );
}
