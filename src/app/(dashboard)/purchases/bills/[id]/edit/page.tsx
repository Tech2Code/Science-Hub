"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { StatusBadge } from "@/components/ui/Badge";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { useDirty } from "@/lib/useDirty";
import styles from "./edit.module.css";

interface BillItem {
  id: string; name: string; quantity: number; unit: string;
  purchasePrice: number; gstRate: number; gstAmount: number; total: number;
  product: { id: string; name: string } | null;
}
interface PurchaseBill {
  id: string; billNumber: string; vendorId: string; billDate: string; dueDate: string | null;
  category: string | null; notes: string | null; status: string;
  subtotal: number; taxAmount: number; discount: number; total: number; paidAmount: number;
  attachmentUrl: string | null; attachmentName: string | null;
  vendor: { id: string; name: string; company: string | null; gstin: string | null };
  items: BillItem[];
}
interface Vendor { id: string; name: string; company: string | null; }
interface Product { id: string; name: string; sku: string | null; unit: string; price: number; purchasePrice: number | null; gstRate: number; }

interface LineItem {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  gstRate: string;
}

const CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
const UNITS = ["Pcs", "Box", "Set", "Kg", "Ltr", "Mtr", "Dozen", "Pack", "Pair"];
const GST_RATES = ["0", "5", "12", "18", "28"];
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

function calcItem(item: LineItem) {
  const qty   = toNum(item.quantity);
  const price = toNum(item.purchasePrice);
  const rate  = toNum(item.gstRate);
  const subtotal  = qty * price;
  const gstAmount = subtotal * rate / 100;
  return { subtotal, gstAmount, total: subtotal + gstAmount };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

export default function EditPurchaseBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast  = useToast();

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bill,    setBill]    = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState("");
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [notes,     setNotes]     = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [items,     setItems]     = useState<LineItem[]>([]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // The bill's persisted attachment when the page loaded — used to tell a
  // saved attachment apart from one uploaded this session but not saved yet,
  // so an unsaved upload that gets replaced/removed can be discarded right
  // away instead of orphaning in Blob storage until someone notices.
  const originalAttachmentUrl = useRef<string | null>(null);

  const { isDirty, markClean } = useDirty({
    vendorId, billDate, dueDate, category, notes, discount, items, attachmentUrl, attachmentName,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/purchase-bills/${id}`, { headers: { "x-no-loader": "1" } }).then(r => r.json()),
      fetch("/api/vendors", { headers: { "x-no-loader": "1" } }).then(r => r.json()),
      fetch("/api/products", { headers: { "x-no-loader": "1" } }).then(r => r.json()),
    ]).then(([b, v, p]) => {
      setBill(b);
      setVendors(v);
      setProducts(p);
      setVendorId(b.vendorId ?? "");
      setBillDate(b.billDate ? b.billDate.slice(0, 10) : "");
      setDueDate(b.dueDate  ? b.dueDate.slice(0, 10)  : "");
      setCategory(b.category ?? "");
      setNotes(b.notes ?? "");
      setDiscount(String(b.discount ?? 0));
      setItems((b.items ?? []).map((item: BillItem) => ({
        productId: item.product?.id ?? "",
        name: item.name,
        unit: item.unit,
        quantity: String(item.quantity),
        purchasePrice: String(item.purchasePrice),
        gstRate: String(item.gstRate),
      })));
      setAttachmentUrl(b.attachmentUrl ?? null);
      setAttachmentName(b.attachmentName ?? null);
      originalAttachmentUrl.current = b.attachmentUrl ?? null;
      // Snapshot the freshly-loaded values directly rather than relying on
      // the state set above — those updates haven't committed yet at this
      // point in the callback, so reading them back here would be stale.
      markClean({
        vendorId: b.vendorId ?? "",
        billDate: b.billDate ? b.billDate.slice(0, 10) : "",
        dueDate: b.dueDate ? b.dueDate.slice(0, 10) : "",
        category: b.category ?? "",
        notes: b.notes ?? "",
        discount: String(b.discount ?? 0),
        items: (b.items ?? []).map((item: BillItem) => ({
          productId: item.product?.id ?? "",
          name: item.name,
          unit: item.unit,
          quantity: String(item.quantity),
          purchasePrice: String(item.purchasePrice),
          gstRate: String(item.gstRate),
        })),
        attachmentUrl: b.attachmentUrl ?? null,
        attachmentName: b.attachmentName ?? null,
      });
      setLoading(false);
    }).catch(() => { setLoadErr("Failed to load bill."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markClean is stable-enough for this one-time load
  }, [id]);

  function discardIfUnsaved(url: string | null) {
    // Only ever discard a blob that isn't the bill's saved attachment — that
    // one is cleaned up by the PUT route itself once the change is committed.
    if (url && url !== originalAttachmentUrl.current) {
      fetch("/api/purchase-bills/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).catch(() => {});
    }
  }

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
        discardIfUnsaved(attachmentUrl);
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
    discardIfUnsaved(attachmentUrl);
    setAttachmentUrl(null);
    setAttachmentName(null);
  }

  const handleItemChange = useCallback((idx: number, field: keyof LineItem, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const handleProductSelect = useCallback((idx: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setItems(prev => {
      const next = [...prev];
      if (product) {
        const rate = product.purchasePrice ?? product.price;
        next[idx] = {
          ...next[idx],
          productId: product.id,
          name: product.name,
          unit: product.unit,
          purchasePrice: rate != null ? String(rate) : next[idx].purchasePrice,
          gstRate: String(product.gstRate),
        };
      } else {
        next[idx] = { ...next[idx], productId: "", name: "" };
      }
      return next;
    });
  }, [products]);

  function addItem() { setItems(prev => [...prev, { productId: "", name: "", unit: "Pcs", quantity: "1", purchasePrice: "", gstRate: "18" }]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const subtotal   = items.reduce((s, i) => s + calcItem(i).subtotal, 0);
  const taxTotal   = items.reduce((s, i) => s + calcItem(i).gstAmount, 0);
  const computedTotal = subtotal + taxTotal - toNum(discount);
  const outstanding   = bill ? computedTotal - bill.paidAmount : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Belt-and-suspenders: the Save button is disabled while clean, but a
    // disabled button doesn't stop Enter-key form submission from an input.
    if (!isDirty) { toast({ type: "error", title: "Nothing to save", message: "No changes have been made yet." }); return; }
    if (attachmentUploading) { toast({ type: "error", title: "Check form", message: "Please wait for the attachment to finish uploading." }); return; }
    if (!vendorId) { toast({ type: "error", title: "Check form", message: "Please select a vendor." }); return; }
    if (!billDate) { toast({ type: "error", title: "Check form", message: "Bill date is required." }); return; }
    if (items.length === 0)                      { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (items.some(i => !i.name.trim()))          { toast({ type: "error", title: "Check form", message: "All items must have a name." }); return; }
    if (items.some(i => toNum(i.quantity) <= 0))  { toast({ type: "error", title: "Check form", message: "All quantities must be greater than 0." }); return; }
    if (items.some(i => !i.purchasePrice.trim() || toNum(i.purchasePrice) <= 0)) { toast({ type: "error", title: "Check form", message: "All item prices must be greater than 0." }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        vendorId,
        billDate,
        dueDate:  dueDate || null,
        category: category || null,
        notes:    notes.trim() || null,
        discount: toNum(discount),
        attachmentUrl,
        attachmentName,
        items: items.map(i => ({
          productId:     i.productId || null,
          name:          i.name.trim(),
          unit:          i.unit,
          quantity:      toNum(i.quantity),
          purchasePrice: toNum(i.purchasePrice),
          gstRate:       toNum(i.gstRate),
          gstAmount:     calcItem(i).gstAmount,
          total:         calcItem(i).total,
        })),
      };
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
        bustCache(`/api/purchase-bills/${id}`);
        toast({ type: "success", title: "Bill updated", message: "Changes saved successfully." });
        router.push(`/purchases/bills/${id}`);
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to update bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  if (loading) return <div className="loading-center">Loading bill…</div>;
  if (loadErr)  return <div className={`error-banner ${styles.loadErr}`}>{loadErr}</div>;

  // Fully paid/cancelled bills have nothing left to edit — reachable directly
  // by URL even though the detail page's Edit button is disabled for these,
  // so guard here too rather than showing a form that has nowhere useful to go.
  if (bill && (bill.status === "paid" || bill.status === "cancelled")) {
    return (
      <div className={`page-stack ${styles.pageStack}`}>
        <Breadcrumb items={[
          { label: "Purchase Bills", href: "/purchases/bills" },
          { label: bill.billNumber, href: `/purchases/bills/${id}` },
          { label: "Edit" },
        ]} />
        <div className={`error-banner ${styles.loadErr}`}>
          This bill is {bill.status} and cannot be edited.
        </div>
        <div className="form-actions">
          <Button variant="secondary" href={`/purchases/bills/${id}`}>← Back to Bill</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[
        { label: "Purchase Bills", href: "/purchases/bills" },
        { label: bill?.billNumber ?? "Bill", href: `/purchases/bills/${id}` },
        { label: "Edit" },
      ]} />

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Edit Bill — {bill?.billNumber}</h1>
          <p className="page-sub">{bill?.vendor.name}{bill?.vendor.company ? ` · ${bill.vendor.company}` : ""}</p>
        </div>
        {bill && <StatusBadge status={bill.status} />}
      </div>

      {/* Summary stats */}
      {bill && (
        <div className={styles.statGrid}>
          <StatCard label="Subtotal"    value={`₹${fmt(subtotal)}`} />
          <StatCard label="GST"         value={`₹${fmt(taxTotal)}`} />
          <StatCard label="Paid"        value={`₹${fmt(bill.paidAmount)}`} />
          <StatCard label="Outstanding" value={`₹${fmt(outstanding)}`} sub={outstanding <= 0 ? "Cleared" : undefined} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-stack">

        {/* Editable fields */}
        <div className="form-card">
          <h2 className="form-section-title">Bill Details</h2>

          <FormField label="Vendor" required>
            <Select value={vendorId} onChange={e => setVendorId(e.target.value)}>
              <option value="">Select a vendor…</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ""}</option>
              ))}
            </Select>
          </FormField>

          <div className="form-grid-2">
            <FormField label="Bill Date" required>
              <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
            </FormField>
            <FormField label="Due Date">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={billDate} />
            </FormField>
          </div>

          <FormField label="Category">
            <Select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— None —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </FormField>

          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </FormField>

          <FormField label="Attachment (bill copy / receipt)">
            {attachmentUploading ? (
              <span className={styles.attachmentUploading}>Uploading…</span>
            ) : attachmentName ? (
              <div className={styles.attachmentRow}>
                {attachmentUrl && <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className={styles.attachmentLink}>{attachmentName}</a>}
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

        {/* Line items */}
        <div className="form-card">
          <div className={styles.itemsSectionHeaderRow}>
            <h2 className={`form-section-title ${styles.itemsSectionTitle}`}>Items</h2>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Item
            </Button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  {["Product (optional)", "Item Name", "Unit", "Qty", "Rate (₹)", "GST %", "Amount", ""].map(h => (
                    <th key={h} className={h === "Amount" ? styles.itemsThRight : styles.itemsTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { total } = calcItem(item);
                  return (
                    <tr key={idx} className={styles.itemsRow}>
                      <td className={styles.itemsTdName}>
                        <Select sz="sm" value={item.productId} onChange={e => handleProductSelect(idx, e.target.value)}>
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                        </Select>
                      </td>
                      <td className={styles.itemsTdName}>
                        <Input sz="sm" value={item.name} onChange={e => handleItemChange(idx, "name", e.target.value)} placeholder="Item name" required />
                      </td>
                      <td className={styles.itemsTd}>
                        <Select sz="sm" value={item.unit} onChange={e => handleItemChange(idx, "unit", e.target.value)}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td className={styles.itemsTd}>
                        <Input sz="sm" type="number" min="1" step="1" value={item.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)} />
                      </td>
                      <td className={styles.itemsTd}>
                        <Input sz="sm" type="number" min="0" step="0.01" value={item.purchasePrice} onChange={e => handleItemChange(idx, "purchasePrice", e.target.value)} placeholder="0.00" />
                      </td>
                      <td className={styles.itemsTd}>
                        <Select sz="sm" value={item.gstRate} onChange={e => handleItemChange(idx, "gstRate", e.target.value)}>
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </Select>
                      </td>
                      <td className={styles.itemsTdTotal}>₹{fmt(total)}</td>
                      <td className={styles.itemsTdAction}>
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
        </div>

        {/* Discount & revised total */}
        <div className="form-card">
          <h2 className="form-section-title">Discount Adjustment</h2>
          <div className={styles.discountRow}>
            <div className={styles.discountField}>
              <FormField label="Discount (₹)">
                <Input
                  type="number" min="0" step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
            </div>
            <div className={styles.totalBlock}>
              <div className={styles.totalLabel}>Revised Total</div>
              <div className={styles.totalValue}>₹{fmt(computedTotal)}</div>
              {toNum(discount) > 0 && (
                <div className={styles.totalSub}>
                  ₹{fmt(subtotal + taxTotal)} − ₹{fmt(toNum(discount))} discount
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving || !isDirty} title={!isDirty ? "No changes to save" : undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Save Changes
          </Button>
          <Button variant="secondary" href={`/purchases/bills/${id}`}>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
