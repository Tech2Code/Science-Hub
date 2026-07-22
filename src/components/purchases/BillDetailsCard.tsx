"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { AttachmentPicker } from "@/components/purchases/AttachmentPicker";
import { useToast } from "@/components/ui/Toast";
import { bustCache } from "@/lib/useCache";
import { rules, validateForm, hasErrors, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { PURCHASE_BILL_CATEGORIES, type PurchaseBillVendor } from "@/lib/purchaseBillForm";
import styles from "./BillDetailsCard.module.css";

type InlineVendorForm = { name: string; company: string; phone: string; email: string; gstin: string; address: string; [key: string]: string };
const BLANK_INLINE_VENDOR: InlineVendorForm = { name: "", company: "", phone: "", email: "", gstin: "", address: "" };

interface BillDetailsCardProps {
  sectionIndex: number;
  vendors: PurchaseBillVendor[];
  vendorId: string;
  onVendorIdChange: (id: string) => void;
  onVendorCreated: (vendor: PurchaseBillVendor) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  billDate: string;
  onBillDateChange: (date: string) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  attachmentUploading: boolean;
  attachmentName: string | null;
  attachmentUrl?: string | null;
  onAttachmentFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: () => void;
}

// Vendor (+ inline "create vendor" flow) / Category / Bill Date / Due Date /
// Notes / Attachment — shared by the New Purchase Bill and Edit Purchase
// Bill pages so the two forms can't drift apart.
export function BillDetailsCard({
  sectionIndex, vendors, vendorId, onVendorIdChange, onVendorCreated,
  category, onCategoryChange, billDate, onBillDateChange, dueDate, onDueDateChange,
  notes, onNotesChange, attachmentUploading, attachmentName, attachmentUrl,
  onAttachmentFileChange, onAttachmentRemove,
}: BillDetailsCardProps) {
  const toast = useToast();
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [ivForm, setIvForm] = useState<InlineVendorForm>(BLANK_INLINE_VENDOR);
  const [ivSaving, setIvSaving] = useState(false);
  const [ivError, setIvError] = useState("");
  const [ivFieldErrors, setIvFieldErrors] = useState<FormErrors<InlineVendorForm>>({});

  function openVendorCreate() {
    setIvForm(BLANK_INLINE_VENDOR);
    setIvError("");
    setIvFieldErrors({});
    setShowVendorCreate(true);
  }

  function updateIvField<K extends keyof InlineVendorForm>(field: K, value: string) {
    setIvForm((p) => ({ ...p, [field]: value }));
    setIvFieldErrors((p) => ({ ...p, [field]: undefined }));
  }

  async function handleCreateInlineVendor() {
    const newErrors = validateForm<InlineVendorForm>(ivForm, {
      name:    [rules.required("Vendor name is required.")],
      phone:   [rules.required("Phone number is required."), rules.phone10()],
      email:   [rules.email()],
      gstin:   [rules.maxLength(15), rules.gstin()],
      address: [rules.required("Address is required.")],
    });
    if (hasErrors(newErrors)) { setIvFieldErrors(newErrors); return; }
    setIvFieldErrors({});
    setIvSaving(true); setIvError("");
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:    ivForm.name.trim(),
          company: ivForm.company.trim() || null,
          gstin:   ivForm.gstin.trim() || null,
          phone:   ivForm.phone.trim() || null,
          email:   ivForm.email.trim() || null,
          address: ivForm.address.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onVendorCreated(data);
        onVendorIdChange(data.id);
        setShowVendorCreate(false);
        bustCache("/api/vendors");
        toast({ type: "success", title: "Vendor created", message: `${data.name} added and selected.` });
      } else {
        setIvError(data.error ?? "Failed to create vendor.");
      }
    } catch {
      setIvError("Network error — please try again.");
    }
    setIvSaving(false);
  }

  return (
    <div {...animateSection(sectionIndex, "form-card")}>
      <h2 className="form-section-title">Bill Details</h2>

      <div className="form-grid-2">
        <FormField label="Vendor" required>
          <Select value={vendorId} onChange={(e) => { onVendorIdChange(e.target.value); if (e.target.value) setShowVendorCreate(false); }}>
            <option value="">Select a vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ""}</option>
            ))}
          </Select>
          {!vendorId && !showVendorCreate && (
            <button type="button" onClick={openVendorCreate} className={styles.addVendorLink}>
              + Add new vendor manually
            </button>
          )}
        </FormField>
        <FormField label="Category">
          <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="">— None —</option>
            {PURCHASE_BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </FormField>
      </div>

      {showVendorCreate && (
        <div className={styles.inlineVendorCard}>
          <div className={styles.inlineVendorHeader}>
            <div className={styles.inlineVendorHeaderLeft}>
              <div className={styles.inlineVendorIcon}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div>
                <div className={styles.inlineVendorTitle}>New Vendor</div>
                <div className={styles.inlineVendorSub}>Not in your list — fill details and create</div>
              </div>
            </div>
            <button type="button" onClick={() => setShowVendorCreate(false)} className={styles.inlineVendorCloseBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className={styles.inlineVendorBody}>
            {ivError && <div className={styles.inlineVendorError}>{ivError}</div>}

            <div className={styles.inlineVendorGrid}>
              <FormField label="Vendor Name" required error={ivFieldErrors.name}>
                <Input value={ivForm.name} onChange={(e) => updateIvField("name", e.target.value)} placeholder="e.g. Sharma Chemicals" />
              </FormField>
              <FormField label="Company / Trade Name">
                <Input value={ivForm.company} onChange={(e) => updateIvField("company", e.target.value)} placeholder="Optional" />
              </FormField>
              <FormField label="GSTIN" error={ivFieldErrors.gstin}>
                <Input value={ivForm.gstin} onChange={(e) => updateIvField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" maxLength={15} mono />
              </FormField>
              <FormField label="Phone" required error={ivFieldErrors.phone}>
                <Input type="tel" inputMode="numeric" value={ivForm.phone} onChange={(e) => updateIvField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" maxLength={10} />
              </FormField>
              <FormField label="Email" error={ivFieldErrors.email}>
                <Input type="email" value={ivForm.email} onChange={(e) => updateIvField("email", e.target.value)} placeholder="vendor@example.com" />
              </FormField>
              <FormField label="Address" required error={ivFieldErrors.address}>
                <Input value={ivForm.address} onChange={(e) => updateIvField("address", e.target.value)} placeholder="Street / locality" />
              </FormField>
            </div>
          </div>

          <div className={styles.inlineVendorFooter}>
            <Button type="button" variant="primary" disabled={ivSaving} onClick={handleCreateInlineVendor}>
              {ivSaving ? "Creating…" : (
                <span className={styles.inlineVendorSubmitLabel}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Create &amp; Use This Vendor
                </span>
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowVendorCreate(false)}>Dismiss</Button>
          </div>
        </div>
      )}

      <div className="form-grid-2">
        <FormField label="Bill Date" required>
          <Input type="date" value={billDate} onChange={(e) => onBillDateChange(e.target.value)} max={dueDate || undefined} />
        </FormField>
        <FormField label="Due Date">
          <Input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} min={billDate} />
        </FormField>
      </div>

      <FormField label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Optional notes about this purchase…" />
      </FormField>

      <FormField label="Attachment (bill copy / receipt)">
        <AttachmentPicker
          uploading={attachmentUploading}
          name={attachmentName}
          url={attachmentUrl}
          onFileChange={onAttachmentFileChange}
          onRemove={onAttachmentRemove}
        />
      </FormField>
    </div>
  );
}
