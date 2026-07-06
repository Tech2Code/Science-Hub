"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import styles from "./billNew.module.css";

interface Vendor { id: string; name: string; company: string | null; gstin: string | null; }
interface Product { id: string; name: string; sku: string | null; unit: string; purchasePrice: number | null; gstRate: number; }

interface LineItem {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  gstRate: string;
}

const BLANK_ITEM: LineItem = { productId: "", name: "", unit: "Pcs", quantity: "1", purchasePrice: "", gstRate: "18" };
const UNITS = ["Pcs", "Box", "Set", "Kg", "Ltr", "Mtr", "Dozen", "Pack", "Pair"];
const GST_RATES = ["0", "5", "12", "18", "28"];
const CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];

function toNum(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

function calcItem(item: LineItem) {
  const qty   = toNum(item.quantity);
  const price = toNum(item.purchasePrice);
  const rate  = toNum(item.gstRate);
  const subtotal  = qty * price;
  const gstAmount = subtotal * rate / 100;
  return { subtotal, gstAmount, total: subtotal + gstAmount };
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

  // Catalog save state: set of item indices currently being saved
  const [catalogSaving, setCatalogSaving] = useState<Set<number>>(new Set());

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<LineItem[]>([{ ...BLANK_ITEM }]);

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
    if (!ivName.trim()) { setIvError("Vendor name is required."); return; }
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

  async function handleAddToCatalog(idx: number) {
    const item = items[idx];
    if (!item.name.trim()) return;
    setCatalogSaving(prev => new Set(prev).add(idx));
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:     item.name.trim(),
          unit:     item.unit,
          price:    toNum(item.purchasePrice),
          gstRate:  toNum(item.gstRate),
          stock:    0,
          minStock: 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts(prev => [...prev, data]);
        setItems(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], productId: data.id };
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
    setCatalogSaving(prev => { const s = new Set(prev); s.delete(idx); return s; });
  }

  const subtotal   = items.reduce((s, i) => s + calcItem(i).subtotal, 0);
  const taxTotal   = items.reduce((s, i) => s + calcItem(i).gstAmount, 0);
  const disc       = toNum(discount);
  const grandTotal = subtotal + taxTotal - disc;

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
        next[idx] = {
          ...next[idx],
          productId: product.id,
          name: product.name,
          unit: product.unit,
          purchasePrice: product.purchasePrice != null ? String(product.purchasePrice) : "",
          gstRate: String(product.gstRate),
        };
      } else {
        next[idx] = { ...next[idx], productId: "", name: "" };
      }
      return next;
    });
  }, [products]);

  function addItem() { setItems(prev => [...prev, { ...BLANK_ITEM }]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  // Items from scan that are not linked to any product
  const unmatchedItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.productId === "" && item.name.trim() !== "");

  function validationToast(message: string) {
    toast({ type: "error", title: "Check form", message });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId)                                   { validationToast("Please select a vendor."); return; }
    if (items.length === 0)                          { validationToast("Add at least one item."); return; }
    if (items.some(i => !i.name.trim()))             { validationToast("All items must have a name."); return; }
    if (items.some(i => toNum(i.quantity) <= 0))     { validationToast("All quantities must be greater than 0."); return; }
    if (items.some(i => !i.purchasePrice.trim() || toNum(i.purchasePrice) <= 0)) { validationToast("All item prices must be greater than 0."); return; }

    const billItems = items.map(i => ({
      productId:     i.productId || null,
      name:          i.name.trim(),
      unit:          i.unit,
      quantity:      toNum(i.quantity),
      purchasePrice: toNum(i.purchasePrice),
      gstRate:       toNum(i.gstRate),
      gstAmount:     calcItem(i).gstAmount,
      total:         calcItem(i).total,
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
                  onClick={() => { setIvName(""); setIvCompany(""); setIvGstin(""); setIvPhone(""); setIvEmail(""); setIvAddress(""); setIvError(""); setShowVendorCreate(true); }}
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
                  <FormField label="Vendor Name" required>
                    <Input value={ivName} onChange={e => setIvName(e.target.value)} placeholder="e.g. Sharma Chemicals" />
                  </FormField>
                  <FormField label="Company / Trade Name">
                    <Input value={ivCompany} onChange={e => setIvCompany(e.target.value)} placeholder="Optional" />
                  </FormField>
                  <FormField label="GSTIN">
                    <Input value={ivGstin} onChange={e => setIvGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
                  </FormField>
                  <FormField label="Phone">
                    <Input value={ivPhone} onChange={e => setIvPhone(e.target.value)} placeholder="10-digit mobile" />
                  </FormField>
                  <FormField label="Email">
                    <Input type="email" value={ivEmail} onChange={e => setIvEmail(e.target.value)} placeholder="vendor@example.com" />
                  </FormField>
                  <FormField label="Address">
                    <Input value={ivAddress} onChange={e => setIvAddress(e.target.value)} placeholder="Street / locality" />
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
                  {["Product (optional)", "Item Name", "Unit", "Qty", "Rate (₹)", "GST %", "Amount", ""].map(h => (
                    <th key={h} className={h === "Amount" ? styles.thRight : styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { total } = calcItem(item);
                  return (
                    <tr key={idx} className={styles.itemRow}>
                      <td className={styles.tdSelect}>
                        <Select sz="sm" value={item.productId} onChange={e => handleProductSelect(idx, e.target.value)}>
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                        </Select>
                      </td>
                      <td className={styles.tdSelect}>
                        <Input sz="sm" value={item.name} onChange={e => handleItemChange(idx, "name", e.target.value)} placeholder="Item name" required />
                      </td>
                      <td className={styles.tdUnit}>
                        <Select sz="sm" value={item.unit} onChange={e => handleItemChange(idx, "unit", e.target.value)}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td className={styles.tdQty}>
                        <Input sz="sm" type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)} className={styles.numInputRight} />
                      </td>
                      <td className={styles.tdRate}>
                        <Input sz="sm" type="number" min="0" step="0.01" value={item.purchasePrice} onChange={e => handleItemChange(idx, "purchasePrice", e.target.value)} placeholder="0.00" className={styles.numInputRight} />
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
                  <div key={idx} className={styles.unmatchedRow}>
                    <div>
                      <div className={styles.unmatchedName}>{item.name}</div>
                      <div className={styles.unmatchedMeta}>
                        {item.unit} · ₹{fmt(toNum(item.purchasePrice))} · GST {item.gstRate}%
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={catalogSaving.has(idx)}
                      onClick={() => handleAddToCatalog(idx)}
                      className={catalogSaving.has(idx) ? styles.saveToCatalogBtnSaving : styles.saveToCatalogBtn}
                    >
                      {catalogSaving.has(idx) ? (
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
                {[
                  { label: "Subtotal", value: `₹${fmt(subtotal)}` },
                  { label: "GST",      value: `₹${fmt(taxTotal)}` },
                ].map(r => (
                  <div key={r.label} className={styles.totalsLine}>
                    <span>{r.label}</span><span>{r.value}</span>
                  </div>
                ))}
                <div className={styles.totalsDiscountLine}>
                  <span>Discount (₹)</span>
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
              <div className="form-grid-2">
                <FormField label="Amount (₹)">
                  <Input type="number" min="0" step="0.01" max={grandTotal} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max ₹${fmt(grandTotal)}`} />
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
