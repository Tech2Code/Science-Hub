"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { VendorFormFields } from "@/components/vendors/VendorFormFields";
import { BLANK_VENDOR_FORM, validateVendorForm, normalizeVendorField, type VendorFormData } from "@/lib/vendorForm";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { hasErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import styles from "./vendorEdit.module.css";

export default function EditVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [form, setForm] = useState<VendorFormData>(BLANK_VENDOR_FORM);
  const [initialForm, setInitialForm] = useState<VendorFormData | null>(null);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof validateVendorForm>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/vendors/${id}`, { headers: { "x-no-loader": "1" } })
      .then(r => r.json())
      .then(d => {
        const loaded: VendorFormData = {
          name: d.name ?? "", company: d.company ?? "", gstin: d.gstin ?? "",
          phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "",
          notes: d.notes ?? "", isActive: d.isActive !== false,
        };
        setForm(loaded);
        setInitialForm(loaded);
        setLoadedUpdatedAt(d.updatedAt ?? null);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const nextValue = normalizeVendorField(name, value);
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : nextValue }));
    setErrors(prev => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validateVendorForm(form, { requirePhone: false, requireAddress: false });
    if (hasErrors(newErrors)) { setErrors(newErrors); return; }
    setErrors({});
    setSaving(true);
    const res = await fetch(`/api/vendors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, expectedUpdatedAt: loadedUpdatedAt }),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/vendors");
      toast({ type: "success", title: "Vendor updated", message: "Changes saved." });
      router.push(`/purchases/vendors/${id}`);
    } else if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      bustCache(`/api/vendors/${id}`);
      toast({ type: "error", title: "Update conflict", message: d?.error ?? "This vendor was changed by someone else. Please reload and try again." });
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ type: "error", title: "Failed", message: d.error ?? "Failed to update vendor." });
    }
  }

  const hasChanges = initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm);
  const disabled = loading || saving;

  return (
    <>
    {loading && <OverlayLoader text="Loading vendor…" />}
    {!loading && saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: "Edit Vendor" }]} />
      <h1 className="page-title">Edit Vendor</h1>

      <form onSubmit={handleSubmit} {...animateSection(0, "form-card")}>
        <VendorFormFields form={form} onChange={handleChange} errors={errors} disabled={disabled} />

        <div className="form-actions-wrap">
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={disabled || !hasChanges}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              Update Vendor
            </Button>
            <Button variant="secondary" href={`/purchases/vendors/${id}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cancel
            </Button>
          </div>
          {!loading && !hasChanges && !saving && (
            <span className={styles.noChanges}>No changes detected.</span>
          )}
        </div>
      </form>
    </div>
    </>
  );
}
