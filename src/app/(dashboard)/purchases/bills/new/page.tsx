"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validateForm, hasErrors, type FormErrors } from "@/lib/validation";
import styles from "./billNew.module.css";

interface Vendor { id: string; name: string; company: string | null; gstin: string | null; }
interface Product { id: string; name: string; sku: string | null; unit: string; price: number; purchasePrice: number | null; gstRate: number; }

interface LineItem {
  key: string;
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  gstRate: string;
  discountPercent: string;
}

type InlineVendorForm = { name: string; phone: string; email: string; gstin: string; address: string };
// A stable per-row id, separate from array index — the catalogSalePrice/
// catalogMarginPct/catalogSaving state below is keyed by this so removing a
// row can't silently misapply another row's saved margin/price after the
// array shifts.
let itemKeySeq = 0;
function makeBlankItem(): LineItem {
  itemKeySeq += 1;
  return { key: `item-${itemKeySeq}`, productId: "", name: "", unit: "Pcs", quantity: "1", purchasePrice: "", gstRate: "18", discountPercent: "0" };
}
const UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen", "Pair"];
const GST_RATES = ["0", "5", "12", "18", "28"];
const CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];
const MARGIN_PRESETS = ["10", "15", "20", "25", "30", "40", "50"];
const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

// A custom typed amount rarely lands on a preset % exactly — inject it into
// the option list (rounded to 2dp) so the select actually shows/highlights
// it instead of falling back to blank.
function discountOptionsFor(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  if (DISCOUNT_OPTIONS.includes(rounded)) return DISCOUNT_OPTIONS;
  return [...DISCOUNT_OPTIONS, rounded].sort((a, b) => a - b);
}

function toNum(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Discount is applied to the line's gross amount (qty × rate) before GST —
// taxable value = gross - discount, and GST is computed on that taxable value.
// Mirrors the sales invoice line calculation for consistency.
function calcItem(item: LineItem) {
  const qty     = toNum(item.quantity);
  const price   = toNum(item.purchasePrice);
  const rate    = toNum(item.gstRate);
  const percent = toNum(item.discountPercent);
  const gross           = qty * price;
  const discountAmount  = gross * percent / 100;
  const subtotal  = gross - discountAmount;
  const gstAmount = subtotal * rate / 100;
  return { gross, discountAmount, subtotal, gstAmount, total: subtotal + gstAmount };
}

export default function NewPurchaseBillPage() {
  const router = useRouter();
  const toast  = useToast();

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving,   setSaving]   = useState(false);

  // Inline vendor creation state (shown when scan finds vendor not in DB)
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [ivName,    setIvName]    = useState("");
  const [ivCompany, setIvCompany] = useState("");
  const [ivGstin,   setIvGstin]   = useState("");
  const [ivPhone,   setIvPhone]   = useState("");
  const [ivEmail,   setIvEmail]   = useState("");
  const [ivAddress, setIvAddress] = useState("");
  const [ivSaving,  setIvSaving]  = useState(false);
  const [ivError,   setIvError]   = useState("");
  const [ivFieldErrors, setIvFieldErrors] = useState<FormErrors<InlineVendorForm>>({});

  // Catalog save state: set of item keys currently being saved
  const [catalogSaving, setCatalogSaving] = useState<Set<string>>(new Set());
  // Selling price entered per unmatched-item row before "Save to catalog" —
  // without this the product would be created with sale price == purchase
  // price (zero margin), since the purchase-bill form never asks for one.
  const [catalogSalePrice, setCatalogSalePrice] = useState<Record<string, string>>({});
  // Margin % preset per row — picking one derives the sale price from cost;
  // typing the sale price directly clears this back to "Custom".
  const [catalogMarginPct, setCatalogMarginPct] = useState<Record<string, string>>({});

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<LineItem[]>(() => [makeBlankItem()]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Optional: record payment immediately
  const [addPayment,   setAddPayment]   = useState(false);
  const [payAmount,    setPayAmount]    = useState("");
  const [payMethod,    setPayMethod]    = useState("Cash");
  const [payReference, setPayReference] = useState("");
  const [payDate,      setPayDate]      = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch("/api/vendors", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setVendors).catch(() => {});
    fetch("/api/products", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setProducts).catch(() => {});
  }, []);

  async function handleCreateInlineVendor() {
    const newErrors = validateForm<InlineVendorForm>({ name: ivName, phone: ivPhone, email: ivEmail, gstin: ivGstin, address: ivAddress }, {
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
          name:    ivName.trim(),
          company: ivCompany.trim() || null,
          gstin:   ivGstin.trim() || null,
          phone:   ivPhone.trim() || null,
          email:   ivEmail.trim() || null,
          address: ivAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setVendors(prev => [...prev, data]);
        setVendorId(data.id);
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

  function handleCatalogSalePriceChange(key: string, value: string) {
    setCatalogSalePrice(prev => ({ ...prev, [key]: value }));
    setCatalogMarginPct(prev => ({ ...prev, [key]: "" }));
  }

  function handleCatalogMarginChange(key: string, cost: string, pct: string) {
    setCatalogMarginPct(prev => ({ ...prev, [key]: pct }));
    if (pct === "") return;
    setCatalogSalePrice(prev => ({ ...prev, [key]: (toNum(cost) * (1 + toNum(pct) / 100)).toFixed(2) }));
  }

  async function handleAddToCatalog(idx: number) {
    const item = items[idx];
    if (!item.name.trim()) return;
    const salePrice = toNum(catalogSalePrice[item.key] ?? item.purchasePrice);
    setCatalogSaving(prev => new Set(prev).add(item.key));
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          item.name.trim(),
          unit:          item.unit,
          price:         salePrice,
          purchasePrice: toNum(item.purchasePrice),
          gstRate:       toNum(item.gstRate),
          stock:    0,
          minStock: 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts(prev => [...prev, data]);
        setItems(prev => {
          const next = [...prev];
          const i = next.findIndex(x => x.key === item.key);
          if (i !== -1) next[i] = { ...next[i], productId: data.id };
          return next;
        });
        bustCache("/api/products");
        toast({ type: "success", title: "Saved to catalog", message: `${data.name} added as a product.` });
      } else {
        toast({ type: "error", title: "Failed", message: data.error ?? "Could not save to catalog." });
      }
    } catch {
      toast({ type: "error", title: "Error", message: "Network error — please try again." });
    }
    setCatalogSaving(prev => { const s = new Set(prev); s.delete(item.key); return s; });
  }

  const grossTotal      = items.reduce((s, i) => s + calcItem(i).gross, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + calcItem(i).discountAmount, 0);
  const subtotal   = items.reduce((s, i) => s + calcItem(i).subtotal, 0);
  const taxTotal   = items.reduce((s, i) => s + calcItem(i).gstAmount, 0);
  const disc       = toNum(discount);
  const grandTotal = subtotal + taxTotal - disc;

  const handleItemChange = useCallback((idx: number, field: keyof LineItem, value: string) => {
    // Typing a name that exactly matches an existing catalog product (and
    // this row isn't already linked) auto-links it — otherwise the item
    // stays unlinked even though it's the same product, which both skips
    // its stock update and risks creating a duplicate catalog entry via
    // "Save to catalog" below.
    if (field === "name" && !items[idx]?.productId) {
      const match = products.find(p => p.name.trim().toLowerCase() === value.trim().toLowerCase());
      if (match) {
        const rate = match.purchasePrice ?? match.price;
        setItems(prev => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name: value,
            productId: match.id,
            unit: match.unit,
            purchasePrice: rate != null ? String(rate) : next[idx].purchasePrice,
            gstRate: String(match.gstRate),
          };
          return next;
        });
        toast({ type: "success", title: "Linked to catalog", message: `Matched existing product "${match.name}".` });
        return;
      }
    }
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    // Rate changed after a margin % was already picked for this row's
    // "save to catalog" card — re-derive the sale price from the new cost
    // instead of leaving it stale from whatever the rate was before.
    const key = items[idx]?.key;
    if (field === "purchasePrice" && key && catalogMarginPct[key]) {
      const pct = catalogMarginPct[key];
      setCatalogSalePrice(prev => ({ ...prev, [key]: (toNum(value) * (1 + toNum(pct) / 100)).toFixed(2) }));
    }
  }, [items, products, toast, catalogMarginPct]);

  // Typing a flat ₹ amount is just another way to set discountPercent — it's
  // converted against that line's gross (qty × rate) so the stored value
  // stays a percentage, same as the sales invoice form.
  function setItemDiscountAmount(idx: number, amountStr: string) {
    const amount = toNum(amountStr);
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = toNum(item.quantity) * toNum(item.purchasePrice);
      const discountPercent = gross > 0 ? Math.min(100, Math.max(0, (amount / gross) * 100)) : 0;
      return { ...item, discountPercent: String(discountPercent) };
    }));
  }

  const handleProductSelect = useCallback((idx: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setItems(prev => {
      const next = [...prev];
      if (product) {
        // Prefer the dedicated purchase price; most existing catalog items
        // won't have one set yet, so fall back to the sale price rather
        // than leaving the rate blank.
        const rate = product.purchasePrice ?? product.price;
        next[idx] = {
          ...next[idx],
          productId: product.id,
          name: product.name,
          unit: product.unit,
          purchasePrice: rate != null ? String(rate) : "",
          gstRate: String(product.gstRate),
        };
      } else {
        next[idx] = { ...next[idx], productId: "", name: "" };
      }
      return next;
    });
  }, [products]);

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/purchase-bills/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAttachmentUrl(data.url);
        setAttachmentName(data.name);
      } else {
        toast({ type: "error", title: "Upload failed", message: data.error ?? "Could not upload file." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Could not upload file." });
    }
    setAttachmentUploading(false);
    e.target.value = "";
  }

  function removeAttachment() {
    // Never saved to a bill yet, so it's safe to discard the blob right away.
    if (attachmentUrl) {
      fetch("/api/purchase-bills/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: attachmentUrl }),
      }).catch(() => {});
    }
    setAttachmentUrl(null);
    setAttachmentName(null);
  }

  function addItem() { setItems(prev => [...prev, makeBlankItem()]); }
  function removeItem(idx: number) {
    const key = items[idx]?.key;
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (key) {
      setCatalogSalePrice(prev => { const next = { ...prev }; delete next[key]; return next; });
      setCatalogMarginPct(prev => { const next = { ...prev }; delete next[key]; return next; });
      setCatalogSaving(prev => { if (!prev.has(key)) return prev; const s = new Set(prev); s.delete(key); return s; });
    }
  }

  // Items from scan that are not linked to any product
  const unmatchedItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.productId === "" && item.name.trim() !== "");

  function validationToast(message: string) {
    toast({ type: "error", title: "Check form", message });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attachmentUploading)                         { validationToast("Please wait for the attachment to finish uploading."); return; }
    if (!vendorId)                                   { validationToast("Please select a vendor."); return; }
    if (items.length === 0)                          { validationToast("Add at least one item."); return; }
    if (items.some(i => !i.name.trim()))             { validationToast("All items must have a name."); return; }
    if (items.some(i => toNum(i.quantity) <= 0))     { validationToast("All quantities must be greater than 0."); return; }
    if (items.some(i => !i.purchasePrice.trim() || toNum(i.purchasePrice) <= 0)) { validationToast("All item prices must be greater than 0."); return; }
    if (dueDate && dueDate < billDate)               { validationToast("Due date cannot be before the bill date."); return; }

    const billItems = items.map(i => ({
      productId:       i.productId || null,
      name:            i.name.trim(),
      unit:            i.unit,
      quantity:        toNum(i.quantity),
      purchasePrice:   toNum(i.purchasePrice),
      discountPercent: toNum(i.discountPercent),
      gstRate:         toNum(i.gstRate),
      discountAmount:  calcItem(i).discountAmount,
      gstAmount:       calcItem(i).gstAmount,
      total:           calcItem(i).total,
    }));

    const payload: Record<string, unknown> = {
      vendorId,
      billDate,
      dueDate:  dueDate || null,
      category: category || null,
      discount: disc,
      subtotal,
      taxAmount: taxTotal,
      total:     grandTotal,
      notes:     notes.trim() || null,
      items:     billItems,
      attachmentUrl,
      attachmentName,
    };

    if (addPayment && toNum(payAmount) > 0) {
      payload.payment = {
        amount:    toNum(payAmount),
        method:    payMethod,
        reference: payReference.trim() || null,
        date:      payDate,
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/purchase-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
        toast({ type: "success", title: "Bill created", message: `${data.billNumber} saved.` });
        router.push(`/purchases/bills/${data.id}`);
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to create purchase bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  return (
    <>
    {saving && <OverlayLoader text="Creating bill…" />}
    {ivSaving && <OverlayLoader text="Creating vendor…" />}
    <div className={`page-stack ${styles.pageWrap}`}>
      <Breadcrumb items={[{ label: "Purchases", href: "/purchases/bills" }, { label: "New Purchase Bill" }]} />
      <h1 className="page-title">New Purchase Bill</h1>

      <form onSubmit={handleSubmit} className="form-stack">

        {/* Bill Details */}
        <div className="form-card">
          <h2 className="form-section-title">Bill Details</h2>

          <div className="form-grid-2">
            <FormField label="Vendor" required>
              <Select value={vendorId} onChange={e => { setVendorId(e.target.value); if (e.target.value) setShowVendorCreate(false); }}>
                <option value="">Select a vendor…</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ""}</option>
                ))}
              </Select>
              {!vendorId && !showVendorCreate && (
                <button
                  type="button"
                  onClick={() => { setIvName(""); setIvCompany(""); setIvGstin(""); setIvPhone(""); setIvEmail(""); setIvAddress(""); setIvError(""); setIvFieldErrors({}); setShowVendorCreate(true); }}
                  className={styles.addVendorLink}
                >
                  + Add new vendor manually
                </button>
              )}
            </FormField>
            <FormField label="Category">
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
          </div>

          {/* ── Inline Vendor Create ── */}
          {showVendorCreate && (
            <div className={styles.inlineVendorCard}>
              {/* Header */}
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

              {/* Body */}
              <div className={styles.inlineVendorBody}>
                {ivError && (
                  <div className={styles.inlineVendorError}>
                    {ivError}
                  </div>
                )}

                <div className={styles.inlineVendorGrid}>
                  <FormField label="Vendor Name" required error={ivFieldErrors.name}>
                    <Input value={ivName} onChange={e => { setIvName(e.target.value); setIvFieldErrors(p => ({ ...p, name: undefined })); }} placeholder="e.g. Sharma Chemicals" />
                  </FormField>
                  <FormField label="Company / Trade Name">
                    <Input value={ivCompany} onChange={e => setIvCompany(e.target.value)} placeholder="Optional" />
                  </FormField>
                  <FormField label="GSTIN" error={ivFieldErrors.gstin}>
                    <Input value={ivGstin} onChange={e => { setIvGstin(e.target.value); setIvFieldErrors(p => ({ ...p, gstin: undefined })); }} placeholder="22AAAAA0000A1Z5" maxLength={15} mono />
                  </FormField>
                  <FormField label="Phone" required error={ivFieldErrors.phone}>
                    <Input type="tel" inputMode="numeric" value={ivPhone} onChange={e => { setIvPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setIvFieldErrors(p => ({ ...p, phone: undefined })); }} placeholder="10-digit mobile" maxLength={10} />
                  </FormField>
                  <FormField label="Email" error={ivFieldErrors.email}>
                    <Input type="email" value={ivEmail} onChange={e => { setIvEmail(e.target.value); setIvFieldErrors(p => ({ ...p, email: undefined })); }} placeholder="vendor@example.com" />
                  </FormField>
                  <FormField label="Address" required error={ivFieldErrors.address}>
                    <Input value={ivAddress} onChange={e => { setIvAddress(e.target.value); setIvFieldErrors(p => ({ ...p, address: undefined })); }} placeholder="Street / locality" />
                  </FormField>
                </div>
              </div>

              {/* Footer */}
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
              <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
            </FormField>
            <FormField label="Due Date">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={billDate} />
            </FormField>
          </div>

          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes about this purchase…" />
          </FormField>

          <FormField label="Attachment (bill copy / receipt)">
            {attachmentUploading ? (
              <span className={styles.attachmentUploading}>Uploading…</span>
            ) : attachmentName ? (
              <div className={styles.attachmentRow}>
                <span className={styles.attachmentName}>{attachmentName}</span>
                <button type="button" onClick={removeAttachment} className={styles.attachmentRemoveBtn}>Remove</button>
              </div>
            ) : (
              <label className={styles.attachmentPicker}>
                <span className={styles.attachmentPickerBtn}>Choose File</span>
                <span className={styles.attachmentPickerHint}>No file chosen</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleAttachmentChange}
                  className={styles.attachmentPickerInput}
                />
              </label>
            )}
          </FormField>
        </div>

        {/* Line Items */}
        <div className="form-card">
          <div className={styles.sectionHeaderRow}>
            <h2 className={`form-section-title ${styles.sectionTitleNoMargin}`}>Items</h2>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Item
            </Button>
          </div>

          <div className={styles.itemsTableWrap}>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  {["Product (optional)", "Item Name", "Unit", "Qty", "Rate (₹)", "Discount", "GST %", "Amount", ""].map(h => (
                    <th key={h} className={h === "Amount" ? styles.thRight : styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { discountAmount, total } = calcItem(item);
                  return (
                    <tr key={item.key} className={styles.itemRow}>
                      <td className={styles.tdProduct}>
                        <Select sz="sm" value={item.productId} onChange={e => handleProductSelect(idx, e.target.value)}>
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                        </Select>
                      </td>
                      <td className={styles.tdName}>
                        <Input sz="sm" value={item.name} onChange={e => handleItemChange(idx, "name", e.target.value)} placeholder="Item name" required />
                      </td>
                      <td className={styles.tdUnit}>
                        <Select sz="sm" value={item.unit} onChange={e => handleItemChange(idx, "unit", e.target.value)}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td className={styles.tdQty}>
                        <Input sz="sm" type="number" min="1" step="1" value={item.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)} className={styles.numInputRight} />
                      </td>
                      <td className={styles.tdRate}>
                        <Input sz="sm" type="text" inputMode="decimal" value={item.purchasePrice} onChange={e => handleItemChange(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                      </td>
                      <td className={styles.tdDiscount}>
                        <div className={styles.discountStack}>
                          <Select sz="sm" value={Math.round(toNum(item.discountPercent) * 100) / 100} onChange={e => handleItemChange(idx, "discountPercent", e.target.value)}>
                            {discountOptionsFor(toNum(item.discountPercent)).map(d => <option key={d} value={d}>{d}%</option>)}
                          </Select>
                          <Input
                            sz="sm" type="text" inputMode="decimal"
                            value={discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""}
                            onChange={e => setItemDiscountAmount(idx, e.target.value)}
                            placeholder="₹0"
                            title="Flat discount amount"
                            className={styles.numInputRight}
                          />
                        </div>
                      </td>
                      <td className={styles.tdGst}>
                        <Select sz="sm" value={item.gstRate} onChange={e => handleItemChange(idx, "gstRate", e.target.value)}>
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </Select>
                      </td>
                      <td className={styles.tdAmount}>₹{fmt(total)}</td>
                      <td className={styles.tdAction}>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={items.length <= 1}
                          title="Remove item"
                          className={items.length <= 1 ? styles.removeItemBtnDisabled : styles.removeItemBtn}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Unmatched items — offer to save to product catalog ── */}
          {unmatchedItems.length > 0 && (
            <div className={styles.unmatchedWrap}>
              <div className={styles.unmatchedHeading}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {unmatchedItems.length} item{unmatchedItems.length > 1 ? "s" : ""} not linked to your product catalog — save them?
              </div>
              <div className={styles.unmatchedList}>
                {unmatchedItems.map(({ item, idx }) => (
                  <div key={item.key} className={styles.unmatchedRow}>
                    <div className={styles.unmatchedInfo}>
                      <div className={styles.unmatchedName} title={item.name}>{item.name}</div>
                      <div className={styles.unmatchedMeta}>
                        {item.unit} · Purchased at ₹{fmt(toNum(item.purchasePrice))} · GST {item.gstRate}%
                      </div>
                    </div>
                    <div className={styles.unmatchedSaleField}>
                      <label className={styles.unmatchedSaleLabel} htmlFor={`margin-pct-${item.key}`}>Margin %</label>
                      <Select
                        id={`margin-pct-${item.key}`}
                        sz="sm"
                        value={catalogMarginPct[item.key] ?? ""}
                        onChange={(e) => handleCatalogMarginChange(item.key, item.purchasePrice, e.target.value)}
                      >
                        <option value="">Custom</option>
                        {MARGIN_PRESETS.map((p) => <option key={p} value={p}>{p}%</option>)}
                      </Select>
                    </div>
                    <div className={styles.unmatchedSaleField}>
                      <label className={styles.unmatchedSaleLabel} htmlFor={`sale-price-${item.key}`}>Sale Price (₹)</label>
                      <Input
                        id={`sale-price-${item.key}`}
                        sz="sm"
                        type="number"
                        min="0"
                        step="0.01"
                        value={catalogSalePrice[item.key] ?? item.purchasePrice}
                        onChange={(e) => handleCatalogSalePriceChange(item.key, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={catalogSaving.has(item.key)}
                      onClick={() => handleAddToCatalog(idx)}
                      className={catalogSaving.has(item.key) ? styles.saveToCatalogBtnSaving : styles.saveToCatalogBtn}
                    >
                      {catalogSaving.has(item.key) ? (
                        <svg className={styles.spinIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      )}
                      Save to catalog
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className={styles.totalsWrap}>
            <div className={styles.totalsAlignRight}>
              <div className={styles.totalsBox}>
                <div className={styles.totalsLine}>
                  <span>Subtotal</span><span>₹{fmt(grossTotal)}</span>
                </div>
                {itemDiscountTotal > 0 && (
                  <div className={styles.totalsLine}>
                    <span>Item Discount</span>
                    <span className={styles.itemDiscountValue}>−₹{fmt(itemDiscountTotal)}</span>
                  </div>
                )}
                <div className={styles.totalsLine}>
                  <span>GST</span><span>₹{fmt(taxTotal)}</span>
                </div>
                <div className={styles.totalsDiscountLine}>
                  <span>Additional Discount (₹)</span>
                  <Input sz="sm" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={styles.discountInput} />
                </div>
                <div className={styles.totalsGrandLine}>
                  <span>Total</span><span>₹{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional Payment */}
        <div className="form-card">
          <label className={styles.paymentCheckboxLabel}>
            <input type="checkbox" checked={addPayment} onChange={e => setAddPayment(e.target.checked)} className={styles.paymentCheckbox} />
            Record payment now
          </label>

          {addPayment && (
            <div className={styles.paymentDetailBox}>
              <div className={`form-grid-2 ${styles.marginBottom1}`}>
                <FormField label="Amount (₹)">
                  <div className={styles.amountRow}>
                    <Input type="number" min="0" step="0.01" max={grandTotal} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max ₹${fmt(grandTotal)}`} className={styles.amountInput} />
                    <button
                      type="button"
                      onClick={() => setPayAmount(grandTotal.toFixed(2))}
                      title="Fill full bill amount"
                      className={styles.payFullBtn}
                    >
                      Pay Full
                    </button>
                  </div>
                </FormField>
                <FormField label="Payment Date">
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </FormField>
              </div>
              <div className="form-grid-2">
                <FormField label="Method">
                  <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormField>
                <FormField label="Reference / UTR">
                  <Input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="e.g. cheque no., UTR…" />
                </FormField>
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Create Purchase Bill
          </Button>
          <Button variant="secondary" href="/purchases/bills">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </Button>
        </div>
      </form>
    </div>
    </>
  );
}
