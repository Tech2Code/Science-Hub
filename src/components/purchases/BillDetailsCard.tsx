"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Modal } from "@/components/dialogs/Modal";
import { AttachmentPicker } from "@/components/purchases/AttachmentPicker";
import { useToast } from "@/components/ui/Toast";
import { bustCachePrefix } from "@/lib/useCache";
import { rules, validateForm, hasErrors, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import { PURCHASE_BILL_CATEGORIES, type PurchaseBillVendor } from "@/lib/purchaseBillForm";
import styles from "./BillDetailsCard.module.css";

type InlineVendorForm = { name: string; company: string; phone: string; email: string; gstin: string; address: string; city: string; state: string; pincode: string; [key: string]: string };
const BLANK_INLINE_VENDOR: InlineVendorForm = { name: "", company: "", phone: "", email: "", gstin: "", address: "", city: "", state: "", pincode: "" };

interface BillDetailsCardProps {
  sectionIndex: number;
  vendors: PurchaseBillVendor[];
  vendorId: string;
  onVendorIdChange: (id: string) => void;
  onVendorCreated: (vendor: PurchaseBillVendor) => void;
  vendorError?: string;
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
  sectionIndex, vendors, vendorId, onVendorIdChange, onVendorCreated, vendorError,
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
    ivPincodeLookup.reset();
  }

  function closeVendorCreate() {
    if (ivSaving) return; // don't let a backdrop/✕ click abandon an in-flight create
    setShowVendorCreate(false);
    ivPincodeLookup.reset();
  }

  function updateIvField<K extends keyof InlineVendorForm>(field: K, value: string) {
    setIvForm((p) => ({ ...p, [field]: value }));
    setIvFieldErrors((p) => ({ ...p, [field]: undefined }));
  }

  const ivPincodeLookup = usePincodeAutofill((city, state) => {
    setIvForm((p) => ({ ...p, city: city || p.city, state: state || p.state }));
    if (city) setIvFieldErrors((p) => ({ ...p, city: undefined }));
    if (state) setIvFieldErrors((p) => ({ ...p, state: undefined }));
  });

  function handleIvPincodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    updateIvField("pincode", digits);
    if (digits.length === 6) ivPincodeLookup.run(digits);
    else ivPincodeLookup.reset();
  }

  async function handleCreateInlineVendor() {
    const newErrors = validateForm<InlineVendorForm>(ivForm, {
      name:    [rules.required("Vendor name is required.")],
      phone:   [rules.required("Phone number is required."), rules.phone10()],
      email:   [rules.email()],
      gstin:   [rules.maxLength(15), rules.gstin()],
      address: [rules.required("Address is required.")],
      city:    [rules.required("City is required.")],
      state:   [rules.required("State is required.")],
      pincode: [rules.required("Pincode is required."), rules.pincode()],
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
          city:    ivForm.city.trim() || null,
          state:   ivForm.state.trim() || null,
          pincode: ivForm.pincode.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onVendorCreated(data);
        onVendorIdChange(data.id);
        closeVendorCreate();
        bustCachePrefix("/api/vendors");
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
        <FormField label="Vendor" required error={vendorError}>
          <Select value={vendorId} onChange={(e) => { onVendorIdChange(e.target.value); if (e.target.value) closeVendorCreate(); }}>
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

      <Modal open={showVendorCreate} onClose={closeVendorCreate} title="New Vendor" maxWidth="38rem">
        <p className={styles.modalSub}>Not in your list — fill details and create</p>

        {ivError && <div className={styles.inlineVendorError}>{ivError}</div>}

        <div className={styles.inlineVendorGrid}>
          <div className="form-grid-2">
            <FormField label="Vendor Name" required error={ivFieldErrors.name}>
              <Input value={ivForm.name} onChange={(e) => updateIvField("name", e.target.value)} placeholder="e.g. Sharma Chemicals" />
            </FormField>
            <FormField label="Company / Trade Name">
              <Input value={ivForm.company} onChange={(e) => updateIvField("company", e.target.value)} placeholder="Optional" />
            </FormField>
          </div>
          <div className="form-grid-2">
            <FormField label="Phone" required error={ivFieldErrors.phone}>
              <PhoneInput value={ivForm.phone} onChange={(e) => updateIvField("phone", e.target.value)} placeholder="10-digit mobile" />
            </FormField>
            <FormField label="Email" error={ivFieldErrors.email}>
              <Input type="email" value={ivForm.email} onChange={(e) => updateIvField("email", e.target.value)} placeholder="vendor@example.com" />
            </FormField>
          </div>
          <FormField label="Address" required error={ivFieldErrors.address}>
            <Input value={ivForm.address} onChange={(e) => updateIvField("address", e.target.value)} placeholder="Street / locality" />
          </FormField>
          <div className="form-grid-2">
            <FormField
              label="Pincode"
              required
              error={ivFieldErrors.pincode}
              hint={ivPincodeLookup.status.status === "loading" ? "Looking up city/state…" : ivPincodeLookup.status.label}
              hintSuccess={ivPincodeLookup.status.status === "found"}
            >
              <Input value={ivForm.pincode} onChange={(e) => handleIvPincodeChange(e.target.value)} placeholder="6-digit" maxLength={6} />
            </FormField>
            <FormField label="GSTIN" error={ivFieldErrors.gstin}>
              <Input value={ivForm.gstin} onChange={(e) => updateIvField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" maxLength={15} mono />
            </FormField>
          </div>
          <div className="form-grid-2">
            <FormField label="City" required error={ivFieldErrors.city}>
              <Input value={ivForm.city} onChange={(e) => updateIvField("city", e.target.value)} placeholder="City" />
            </FormField>
            <FormField label="State" required error={ivFieldErrors.state}>
              <Select value={ivForm.state} onChange={(e) => updateIvField("state", e.target.value)}>
                <option value="">Select state</option>
                {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
          </div>
        </div>

        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={closeVendorCreate}>Dismiss</Button>
          <Button type="button" variant="primary" disabled={ivSaving} onClick={handleCreateInlineVendor}>
            {ivSaving ? "Creating…" : (
              <span className={styles.inlineVendorSubmitLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Create &amp; Use This Vendor
              </span>
            )}
          </Button>
        </div>
      </Modal>

      <div className="form-grid-3">
        <FormField label="Category">
          <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="">— None —</option>
            {PURCHASE_BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        </FormField>
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
    </div>
  );
}
