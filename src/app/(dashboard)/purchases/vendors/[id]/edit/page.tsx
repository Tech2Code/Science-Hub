"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

export default function EditVendorPage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState({
    name: "", company: "", gstin: "", phone: "", email: "", address: "", notes: "", isActive: true,
  });
  const [initialForm, setInitialForm] = useState<typeof form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/vendors/${id}`)
      .then(r => r.json())
      .then(d => {
        const loaded = {
          name: d.name ?? "", company: d.company ?? "", gstin: d.gstin ?? "",
          phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "",
          notes: d.notes ?? "", isActive: d.isActive !== false,
        };
        setForm(loaded);
        setInitialForm(loaded);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load vendor."); setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Vendor name is required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/vendors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/vendors");
      toast({ type: "success", title: "Vendor updated", message: "Changes saved." });
      router.push("/purchases/vendors");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to update vendor.");
    }
  }

  const hasChanges = initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm);

  if (loading) return <div className="loading-center">Loading vendor…</div>;

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack" style={{ maxWidth: "42rem" }}>
      <Breadcrumb items={[{ label: "Vendors", href: "/purchases/vendors" }, { label: "Edit Vendor" }]} />
      <h1 className="page-title">Edit Vendor</h1>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <FormField label="Vendor Name" required>
            <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Lab Supplies Co." />
          </FormField>
          <FormField label="Company / Trade Name">
            <Input name="company" value={form.company} onChange={handleChange} placeholder="e.g. Lab Supplies Pvt. Ltd." />
          </FormField>
        </div>

        <div className="form-grid-2">
          <FormField label="Phone">
            <Input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="10-digit mobile" />
          </FormField>
          <FormField label="Email">
            <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="vendor@example.com" />
          </FormField>
        </div>

        <FormField label="GSTIN">
          <Input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-character GST number" maxLength={15} mono />
        </FormField>

        <FormField label="Address">
          <Textarea name="address" rows={2} value={form.address} onChange={handleChange} placeholder="Street, city, state…" />
        </FormField>

        <FormField label="Notes">
          <Textarea name="notes" rows={2} value={form.notes} onChange={handleChange} placeholder="Any additional notes…" />
        </FormField>

        <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--c-text-2)", fontWeight: 500 }}>
          <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} style={{ width: "1rem", height: "1rem", accentColor: "var(--c-blue)", cursor: "pointer" }} />
          Active vendor
        </label>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving || !hasChanges}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Update Vendor
          </Button>
          {!hasChanges && !saving && (
            <span style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", alignSelf: "center" }}>No changes detected.</span>
          )}
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
