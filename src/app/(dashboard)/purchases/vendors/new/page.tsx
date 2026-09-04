"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { VendorFormFields } from "@/components/vendors/VendorFormFields";
import { BLANK_VENDOR_FORM, validateVendorForm, normalizeVendorField, type VendorFormData } from "@/lib/vendorForm";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import styles from "./vendorNew.module.css";

const DRAFT_KEY = "vendor:new";

export default function NewVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [form, setForm] = useState<VendorFormData>(BLANK_VENDOR_FORM);
  const [errors, setErrors] = useState<ReturnType<typeof validateVendorForm>>({});
  const [saving, setSaving] = useState(false);

  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  useEffect(() => {
    const draft = loadFormDraft<VendorFormData>(DRAFT_KEY);
    const hasContent = !!draft?.values && Object.entries(draft.values).some(([k, v]) => k !== "isActive" && String(v ?? "").trim());
    // One-time sync from localStorage (an external system) on mount — a legitimate effect, not
    // state derivable from props/render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasContent) setShowDraftBanner(true);
    else setDraftReady(true);
  }, []);

  function restoreDraft() {
    const draft = loadFormDraft<VendorFormData>(DRAFT_KEY);
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const nextValue = normalizeVendorField(name, value);
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : nextValue }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateVendorForm(form, { requirePhone: false, requireAddress: true, requireCity: true, requireState: true, requirePincode: true });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({});
    setSaving(true);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      clearFormDraft(DRAFT_KEY);
      bustCachePrefix("/api/vendors");
      toast({ type: "success", title: "Vendor created", message: `"${form.name}" added.` });
      // Deliberately not resetting `saving` here — it must stay locked until
      // navigation actually replaces this page.
      router.push(`/purchases/vendors/${created.id}`);
      return;
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to create vendor." });
    }
    setSaving(false);
  }

  return (
    <>
    {saving && <OverlayLoader text="Creating vendor…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: "New Vendor" }]} />
      <h1 className="page-title">New Vendor</h1>

      <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />
      {showDraftBanner && (
        <InfoBanner
          message="You have an unsaved vendor draft from earlier — want to resume it?"
          actionLabel="Resume draft"
          onAction={restoreDraft}
          onDismiss={dismissDraft}
        />
      )}

      <form onSubmit={handleSubmit} noValidate {...animateSection(0, "form-card")}>
        <VendorFormFields form={form} onChange={handleChange} errors={errors} addressRequired cityRequired stateRequired pincodeRequired autoFocusName />

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
