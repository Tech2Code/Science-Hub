"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import { BLANK_CUSTOMER_FORM, validateCustomerForm, normalizeCustomerField, type CustomerFormData } from "@/lib/customerForm";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import styles from "./customerNew.module.css";

const DRAFT_KEY = "customer:new";

export default function NewCustomerPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [form, setForm] = useState<CustomerFormData>(BLANK_CUSTOMER_FORM);
  const [errors, setErrors] = useState<FormErrors<CustomerFormData>>({});
  const [saving, setSaving] = useState(false);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  useEffect(() => {
    const draft = loadFormDraft<CustomerFormData>(DRAFT_KEY);
    const hasContent = !!draft?.values && Object.values(draft.values).some((v) => String(v ?? "").trim());
    if (hasContent) setShowDraftBanner(true);
    else setDraftReady(true);
  }, []);

  function restoreDraft() {
    const draft = loadFormDraft<CustomerFormData>(DRAFT_KEY);
    if (draft?.values) setForm(draft.values);
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  function dismissDraft() {
    setConfirmDiscardDraftOpen(true);
  }

  function discardDraft() {
    clearFormDraft(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftReady(true);
    setConfirmDiscardDraftOpen(false);
  }

  useFormDraft(DRAFT_KEY, form, !draftReady || saving);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: normalizeCustomerField(name, value) }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateCustomerForm(form, { requirePhone: false, requireAddress: true, requireCity: true, requireState: true, requirePincode: true });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({});
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      clearFormDraft(DRAFT_KEY);
      bustCachePrefix("/api/customers");
      toast({ type: "success", title: "Customer created", message: `"${created.name}" added.` });
      // Deliberately not resetting `saving` here — it must stay locked until
      // navigation actually replaces this page, or the form briefly
      // re-enables during the gap between this await and the route change.
      router.push(`/sales/customers/${created.id}`);
      return;
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to create customer." });
    }
    setSaving(false);
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

      <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />
      {showDraftBanner && (
        <InfoBanner
          message="You have an unsaved customer draft from earlier — want to resume it?"
          actionLabel="Resume draft"
          onAction={restoreDraft}
          onDismiss={dismissDraft}
        />
      )}

      <form onSubmit={handleSubmit} noValidate {...animateSection(0, "form-card")}>
        <CustomerFormFields form={form} onChange={handleChange} errors={errors} addressRequired cityRequired stateRequired pincodeRequired autoFocusName />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Create Customer</Button>
          <Button variant="secondary" href="/sales/customers"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
