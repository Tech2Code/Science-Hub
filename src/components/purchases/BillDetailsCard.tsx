"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/dialogs/Modal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { AttachmentPicker } from "@/components/purchases/AttachmentPicker";
import { useToast } from "@/components/ui/Toast";
import { bustCachePrefix } from "@/lib/useCache";
import { rules, validateForm, hasErrors, toIstDateStr, type FormErrors } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useDirty } from "@/lib/useDirty";
import { INDIA_STATES_FULL } from "@/lib/states";
import { usePincodeAutofill } from "@/lib/usePincodeLookup";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useEntitySearch } from "@/lib/useEntitySearch";
import { PURCHASE_BILL_CATEGORIES, type PurchaseBillVendor } from "@/lib/purchaseBillForm";
import styles from "./BillDetailsCard.module.css";

type InlineVendorForm = { name: string; company: string; phone: string; email: string; gstin: string; address: string; city: string; state: string; pincode: string; [key: string]: string };
const BLANK_INLINE_VENDOR: InlineVendorForm = { name: "", company: "", phone: "", email: "", gstin: "", address: "", city: "", state: "", pincode: "" };

interface BillDetailsCardProps {
  sectionIndex: number;
  vendorId: string;
  onVendorIdChange: (id: string) => void;
  // Seeds the selected-vendor display without an extra fetch (e.g. Edit Bill's own already-loaded
  // `bill.vendor`) — optional, since the card resolves `vendorId` by itself (GET /api/vendors/[id])
  // whenever it doesn't already have a matching selected vendor (draft-restore, ?vendorId= prefill).
  initialVendor?: PurchaseBillVendor | null;
  vendorError?: string;
  category: string;
  onCategoryChange: (category: string) => void;
  billDate: string;
  onBillDateChange: (date: string) => void;
  billDateError?: string;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  dueDateError?: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  attachmentUploading: boolean;
  attachmentName: string | null;
  attachmentUrl?: string | null;
  attachmentSize?: number | null;
  onAttachmentFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: () => void;

  transportChargeEnabled: boolean;
  onToggleTransportCharge: () => void;
  transportCharge: string;
  onTransportChargeChange: (value: string) => void;
  transportChargeGstRate: string;
  onTransportChargeGstRateChange: (value: string) => void;
  transportChargeError?: string;
}

// Shared by New/Edit Purchase Bill pages so the two forms can't drift apart.
export function BillDetailsCard({
  sectionIndex, vendorId, onVendorIdChange, initialVendor, vendorError,
  category, onCategoryChange, billDate, onBillDateChange, billDateError, dueDate, onDueDateChange, dueDateError,
  notes, onNotesChange, attachmentUploading, attachmentName, attachmentUrl, attachmentSize,
  onAttachmentFileChange, onAttachmentRemove,
  transportChargeEnabled, onToggleTransportCharge, transportCharge, onTransportChargeChange,
  transportChargeGstRate, onTransportChargeGstRateChange, transportChargeError,
}: BillDetailsCardProps) {
  const toast = useToast();
  const [todayStr] = useState(() => toIstDateStr(new Date()));
  const vendorFieldId = useId();
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [ivEditId, setIvEditId] = useState<string | null>(null);
  const [ivForm, setIvForm] = useState<InlineVendorForm>(BLANK_INLINE_VENDOR);
  const [ivSaving, setIvSaving] = useState(false);
  const [ivError, setIvError] = useState("");
  const [ivFieldErrors, setIvFieldErrors] = useState<FormErrors<InlineVendorForm>>({});
  const [ivDontSave, setIvDontSave] = useState(false);
  // Guards the inline vendor create path (POST, not the PUT edit path below) — this card stays
  // mounted for the life of the New/Edit Purchase Bill page, so the key must be renewed after each
  // successful create, or a second vendor created later in the same session would be rejected.
  const ivIdempotency = useIdempotencyKey();

  const ivDirty = useDirty(ivForm);

  // Card owns the selected vendor's own details (not a `.find()` over a prefetched full list — see
  // useEntitySearch below for why prefetching every vendor doesn't scale). `initialVendor` seeds this
  // for free when the parent already has it (Edit Bill's loaded `bill.vendor`); otherwise the resolve
  // effect below fetches it once `vendorId` is set from elsewhere (draft-restore, ?vendorId= prefill).
  const [selectedVendor, setSelectedVendor] = useState<PurchaseBillVendor | null>(initialVendor ?? null);
  useEffect(() => {
    if (!vendorId || selectedVendor?.id === vendorId) return;
    let cancelled = false;
    fetch(`/api/vendors/${vendorId}`, { headers: { "x-no-loader": "1" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (!cancelled && v && v.id === vendorId) setSelectedVendor(v); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolves vendorId → full vendor details; selectedVendor is read, not a dep we want to re-trigger on
  }, [vendorId]);

  // pageSize 200 — comfortably covers this app's real vendor counts (dozens-hundreds) so an empty
  // search still browses effectively everything, same as before; typing still narrows via live
  // server search regardless of how large the list grows later.
  const { results: vendorSearchResults, loading: vendorSearchLoading } = useEntitySearch<PurchaseBillVendor>(
    "/api/vendors", vendorSearch, { pageSize: 200, enabled: !vendorId }
  );

  function handleVendorSelect(v: PurchaseBillVendor) {
    setSelectedVendor(v);
    onVendorIdChange(v.id);
    setVendorSearch("");
    setShowVendorDropdown(false);
  }

  function removeVendor() {
    setSelectedVendor(null);
    onVendorIdChange("");
    setVendorSearch("");
    setShowVendorDropdown(false);
  }

  function openVendorCreate() {
    setIvEditId(null);
    setIvForm(BLANK_INLINE_VENDOR);
    setIvError("");
    setIvFieldErrors({});
    setIvDontSave(false);
    setShowVendorCreate(true);
    ivPincodeLookup.reset();
  }

  function openVendorEdit(v: PurchaseBillVendor) {
    const snapshot = {
      name: v.name, company: v.company ?? "", phone: v.phone ?? "", email: v.email ?? "",
      gstin: v.gstin ?? "", address: v.address ?? "", city: v.city ?? "", state: v.state ?? "", pincode: v.pincode ?? "",
    };
    setIvEditId(v.id);
    setIvForm(snapshot);
    ivDirty.markClean(snapshot);
    setIvError("");
    setIvFieldErrors({});
    setIvDontSave(false);
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
      name:    [rules.required("Vendor name is required."), rules.minLength(2), rules.maxLength(200)],
      company: [rules.maxLength(200)],
      phone:   [rules.phone10()],
      email:   [rules.maxLength(254), rules.email()],
      gstin:   [rules.maxLength(15), rules.gstin()],
      address: [rules.required("Address is required."), rules.minLength(5), rules.maxLength(500)],
      city:    [rules.required("City is required."), rules.minLength(2), rules.maxLength(100)],
      state:   [rules.required("State is required.")],
      pincode: [rules.required("Pincode is required."), rules.pincode()],
    });
    if (hasErrors(newErrors)) { setIvFieldErrors(newErrors); return; }
    setIvFieldErrors({});
    setIvSaving(true); setIvError("");
    try {
      const body = {
        name:    ivForm.name.trim(),
        company: ivForm.company.trim() || null,
        gstin:   ivForm.gstin.trim() || null,
        phone:   ivForm.phone.trim() || null,
        email:   ivForm.email.trim() || null,
        address: ivForm.address.trim() || null,
        city:    ivForm.city.trim() || null,
        state:   ivForm.state.trim() || null,
        pincode: ivForm.pincode.trim() || null,
        ...(ivEditId ? {} : { oneOff: ivDontSave, idempotencyKey: ivIdempotency.key() }),
      };
      const res = await fetch(ivEditId ? `/api/vendors/${ivEditId}` : "/api/vendors", {
        method: ivEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        if (!ivEditId) ivIdempotency.renew();
        setSelectedVendor(data);
        onVendorIdChange(data.id);
        setVendorSearch("");
        closeVendorCreate();
        if (ivEditId || !ivDontSave) bustCachePrefix("/api/vendors");
        if (ivEditId) bustCachePrefix("/api/purchase-bills");
        toast(ivEditId
          ? { type: "success", title: "Vendor updated", message: `${data.name} saved.` }
          : { type: "success", title: "Vendor created", message: ivDontSave ? `${data.name} added and selected for this bill only.` : `${data.name} added and selected.` }
        );
      } else {
        setIvError(data.error ?? (ivEditId ? "Failed to update vendor." : "Failed to create vendor."));
      }
    } catch {
      setIvError("Network error — please try again.");
    }
    setIvSaving(false);
  }

  const section = animateSection(sectionIndex, "form-card");

  return (
    <>
    {ivSaving && <OverlayLoader text={ivEditId ? "Saving vendor…" : "Creating vendor…"} />}
    <div className={section.className} style={{ ...section.style, position: "relative", zIndex: showVendorDropdown ? 5 : "auto" }}>
      <h2 className="form-section-title">Bill Details</h2>

      <FormField label="Vendor" required error={vendorError} id={vendorFieldId}>
        {selectedVendor ? (
          <div className={styles.selectedVendor}>
            <div className={styles.selectedVendorInfo}>
              <div className={styles.selectedVendorName}>{selectedVendor.name}{selectedVendor.company ? ` — ${selectedVendor.company}` : ""}</div>
              <div className={styles.selectedVendorSub}>
                {[selectedVendor.city, selectedVendor.state].filter(Boolean).join(", ")}
                {selectedVendor.gstin && ` · GSTIN: ${selectedVendor.gstin}`}
              </div>
              {selectedVendor.isActive === false && (
                <p className={styles.selectHint}>⚠ This vendor is marked Inactive</p>
              )}
            </div>
            <div className={styles.selectedVendorActions}>
              <button type="button" onClick={() => openVendorEdit(selectedVendor)} className={styles.dropdownEmptyLink}>Edit</button>
              <button type="button" onClick={removeVendor} className={styles.removeVendorLink}>Remove</button>
            </div>
          </div>
        ) : (
          <div className={styles.searchWrap}>
            <Input
              id={vendorFieldId}
              type="text"
              placeholder="Search vendor…"
              value={vendorSearch}
              onChange={(e) => { setVendorSearch(e.target.value); onVendorIdChange(""); setShowVendorDropdown(true); }}
              onFocus={() => setShowVendorDropdown(true)}
              onBlur={() => setTimeout(() => setShowVendorDropdown(false), 150)}
              onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
            />
            {showVendorDropdown && (
              <div className={styles.dropdown} onMouseDown={(e) => e.preventDefault()}>
                {vendorSearchLoading ? (
                  <div className={styles.dropdownEmpty}>Searching…</div>
                ) : vendorSearchResults.length > 0 ? vendorSearchResults.map((v) => (
                  <button key={v.id} type="button" onClick={() => handleVendorSelect(v)} className={styles.dropdownBtn}>
                    <div className={styles.dropdownItemName} title={v.name}>
                      {v.name}{v.company ? ` — ${v.company}` : ""}
                      {v.isActive === false && <span className={styles.inactiveTag}>Inactive</span>}
                    </div>
                    <div className={styles.dropdownItemSub}>{[v.city, v.gstin].filter(Boolean).join(" · ")}</div>
                  </button>
                )) : (
                  <div className={styles.dropdownEmpty}>
                    No vendor found.{" "}
                    <button type="button" onClick={() => { setShowVendorDropdown(false); openVendorCreate(); }} className={styles.dropdownEmptyLink}>Add new <ArrowIcon /></button>
                  </div>
                )}
              </div>
            )}
            {vendorSearch && !vendorId && (
              <p className={styles.selectHint}>⚠ Please select a vendor from the dropdown</p>
            )}
            {!showVendorDropdown && (
              <button type="button" onClick={openVendorCreate} className={styles.addVendorLink}>
                + Add new vendor manually
              </button>
            )}
          </div>
        )}
      </FormField>

      <Modal
        open={showVendorCreate}
        onClose={closeVendorCreate}
        title={ivEditId ? "Edit Vendor" : "Add New Vendor"}
        subtitle={ivEditId ? "Update this vendor's details" : "Not in your list — fill details and create"}
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeVendorCreate}>Dismiss</Button>
            <Button
              type="button"
              variant="primary"
              disabled={
                ivSaving ||
                (!!ivEditId && (
                  !ivDirty.isDirty ||
                  !ivForm.name.trim() || !ivForm.address.trim() ||
                  !ivForm.city.trim() || !ivForm.state.trim() || !ivForm.pincode.trim()
                ))
              }
              onClick={handleCreateInlineVendor}
            >
              {ivSaving ? "Saving…" : (
                <span className={styles.inlineVendorSubmitLabel}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {ivEditId ? "Save Changes" : ivDontSave ? "Use For This Bill Only" : "Save & Use This Vendor"}
                </span>
              )}
            </Button>
          </>
        }
      >
        {ivError && <div className={styles.inlineVendorError}>{ivError}</div>}

        <div className={styles.inlineVendorGrid}>
          <div className="form-grid-2">
            <FormField label="Vendor Name" required error={ivFieldErrors.name}>
              <Input value={ivForm.name} onChange={(e) => updateIvField("name", e.target.value)} placeholder="e.g. Sharma Chemicals" maxLength={200} />
            </FormField>
            <FormField label="Company / Trade Name">
              <Input value={ivForm.company} onChange={(e) => updateIvField("company", e.target.value)} placeholder="Optional" maxLength={200} />
            </FormField>
          </div>
          <FormField label="Address" required error={ivFieldErrors.address}>
            <Input value={ivForm.address} onChange={(e) => updateIvField("address", e.target.value)} placeholder="Street / locality" maxLength={500} />
          </FormField>
          <div className="form-grid-2">
            <FormField
              label="Pincode"
              required
              error={ivFieldErrors.pincode}
              hint={ivPincodeLookup.status.status === "loading" ? "Looking up city/state…" : ivPincodeLookup.status.label}
              hintSuccess={ivPincodeLookup.status.status === "found"}
            >
              <Input inputMode="numeric" value={ivForm.pincode} onChange={(e) => handleIvPincodeChange(e.target.value)} placeholder="6-digit" maxLength={6} />
            </FormField>
            <FormField label="State" required error={ivFieldErrors.state}>
              <Select value={ivForm.state} onChange={(e) => updateIvField("state", e.target.value)}>
                <option value="">Select state</option>
                {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="form-grid-2">
            <FormField label="City" required error={ivFieldErrors.city}>
              <Input value={ivForm.city} onChange={(e) => updateIvField("city", e.target.value)} placeholder="City" maxLength={100} />
            </FormField>
            <FormField label="GSTIN" error={ivFieldErrors.gstin}>
              <Input value={ivForm.gstin} onChange={(e) => updateIvField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" maxLength={15} mono />
            </FormField>
          </div>
          <div className="form-grid-2">
            <FormField label="Phone" error={ivFieldErrors.phone}>
              <PhoneInput value={ivForm.phone} onChange={(e) => updateIvField("phone", e.target.value)} placeholder="10-digit mobile" />
            </FormField>
            <FormField label="Email" error={ivFieldErrors.email}>
              <Input type="email" value={ivForm.email} onChange={(e) => updateIvField("email", e.target.value)} placeholder="vendor@example.com" maxLength={254} />
            </FormField>
          </div>
        </div>

        {!ivEditId && (
          <label className={styles.inlineVendorCheckbox}>
            <input type="checkbox" checked={ivDontSave} onChange={(e) => setIvDontSave(e.target.checked)} />
            Just for this bill — don&apos;t save to my vendor list
          </label>
        )}
      </Modal>

      <div className="form-grid-3">
        <FormField label="Category">
          <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="">— None —</option>
            {PURCHASE_BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        </FormField>
        <FormField label="Bill Date" required error={billDateError}>
          <Input type="date" value={billDate} onChange={(e) => onBillDateChange(e.target.value)} max={dueDate && dueDate < todayStr ? dueDate : todayStr} />
        </FormField>
        <FormField label="Due Date" error={dueDateError}>
          <Input type="date" value={dueDate} onChange={(e) => onDueDateChange(e.target.value)} min={billDate} />
        </FormField>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0.5rem 0" }}>
        <Switch checked={transportChargeEnabled} onChange={onToggleTransportCharge} aria-label="Transport charge" />
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Transport Charge</span>
      </div>
      {transportChargeEnabled && (
        <div className="form-grid-2">
          <FormField label="Transport Charge Amount (₹)" required>
            <Input type="number" min="0" step="0.01" value={transportCharge} onChange={(e) => onTransportChargeChange(e.target.value)} placeholder="0.00" />
          </FormField>
          <FormField label="GST Rate on Transport Charge (%)" required>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={transportChargeGstRate}
              onChange={(e) => onTransportChargeGstRateChange(e.target.value)}
              placeholder="18"
            />
          </FormField>
        </div>
      )}
      {transportChargeEnabled && transportChargeError && (
        <p style={{ color: "var(--c-red, #dc2626)", fontSize: "0.8rem", margin: "0.25rem 0 0.5rem" }} role="alert">
          {transportChargeError}
        </p>
      )}

      <FormField label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Optional notes about this purchase…" maxLength={2000} />
      </FormField>

      <FormField label="Attachment (bill copy / receipt)">
        <AttachmentPicker
          uploading={attachmentUploading}
          name={attachmentName}
          url={attachmentUrl}
          size={attachmentSize}
          onFileChange={onAttachmentFileChange}
          onRemove={onAttachmentRemove}
        />
      </FormField>
    </div>
    </>
  );
}
