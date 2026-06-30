"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

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

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.2rem 0.625rem", borderRadius: "9999px", background: "var(--c-bg)", border: "1px solid var(--c-border)", fontSize: "0.75rem", color: "var(--c-text-2)" }}>
      <span style={{ color: "var(--c-text-4)", fontWeight: 500 }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function calcItem(item: LineItem) {
  const qty   = toNum(item.quantity);
  const price = toNum(item.purchasePrice);
  const rate  = toNum(item.gstRate);
  const subtotal  = qty * price;
  const gstAmount = subtotal * rate / 100;
  return { subtotal, gstAmount, total: subtotal + gstAmount };
}

interface ExtractedBill {
  vendorName?: string | null;
  vendorGstin?: string | null;
  billNumber?: string | null;
  billDate?: string | null;
  dueDate?: string | null;
  category?: string | null;
  notes?: string | null;
  items?: Array<{ name: string; quantity: number; unit: string; purchasePrice: number; gstRate: number; }>;
  subtotal?: number | null;
  taxAmount?: number | null;
  discount?: number | null;
  total?: number | null;
}

export default function NewPurchaseBillPage() {
  const router = useRouter();
  const toast  = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // AI Scan state
  const [scanning,   setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState<ExtractedBill | null>(null);
  const [scanError,  setScanError]  = useState("");

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<LineItem[]>([{ ...BLANK_ITEM }]);

  // Optional: record payment immediately
  const [addPayment,    setAddPayment]    = useState(false);
  const [payAmount,     setPayAmount]     = useState("");
  const [payMethod,     setPayMethod]     = useState("Cash");
  const [payReference,  setPayReference]  = useState("");
  const [payDate,       setPayDate]       = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch("/api/vendors").then(r => r.json()).then(setVendors).catch(() => {});
    fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => {});
  }, []);

  async function handleScanFile(file: File) {
    setScanning(true); setScanError(""); setScanResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/purchase-bills/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setScanError(data.error ?? "Extraction failed."); setScanning(false); return; }

      const ext: ExtractedBill = data;
      setScanResult(ext);

      // Auto-fill: vendor — try to match by name (case-insensitive)
      if (ext.vendorName) {
        const match = vendors.find(v =>
          v.name.toLowerCase().includes(ext.vendorName!.toLowerCase()) ||
          ext.vendorName!.toLowerCase().includes(v.name.toLowerCase())
        );
        if (match) setVendorId(match.id);
      }

      // Dates
      if (ext.billDate) setBillDate(ext.billDate);
      if (ext.dueDate)  setDueDate(ext.dueDate);

      // Category
      if (ext.category && CATEGORIES.includes(ext.category)) setCategory(ext.category);

      // Notes — include bill number if extracted
      const noteParts: string[] = [];
      if (ext.billNumber) noteParts.push(`Ref: ${ext.billNumber}`);
      if (ext.notes)      noteParts.push(ext.notes);
      if (noteParts.length) setNotes(noteParts.join(" | "));

      // Discount
      if (ext.discount && ext.discount > 0) setDiscount(String(ext.discount));

      // Line items
      if (ext.items && ext.items.length > 0) {
        const mapped: LineItem[] = ext.items.map(i => {
          const validUnit  = UNITS.includes(i.unit) ? i.unit : "Pcs";
          const validGst   = GST_RATES.includes(String(i.gstRate)) ? String(i.gstRate) : "18";
          // Try to match to existing product
          const prodMatch  = products.find(p => p.name.toLowerCase().includes(i.name.toLowerCase()));
          return {
            productId:     prodMatch?.id ?? "",
            name:          i.name,
            unit:          validUnit,
            quantity:      String(i.quantity > 0 ? i.quantity : 1),
            purchasePrice: String(i.purchasePrice ?? 0),
            gstRate:       validGst,
          };
        });
        setItems(mapped);
      }

      toast({ type: "success", title: "Bill scanned!", message: "Details filled below — review before saving." });
    } catch {
      setScanError("Network error during extraction. Please try again.");
    }
    setScanning(false);
  }

  const subtotal = items.reduce((s, i) => s + calcItem(i).subtotal, 0);
  const taxTotal = items.reduce((s, i) => s + calcItem(i).gstAmount, 0);
  const disc     = toNum(discount);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId)                  { setError("Please select a vendor."); return; }
    if (items.length === 0)         { setError("Add at least one item."); return; }
    if (items.some(i => !i.name.trim())) { setError("All items must have a name."); return; }
    if (items.some(i => toNum(i.quantity) <= 0))  { setError("All quantities must be greater than 0."); return; }
    if (items.some(i => toNum(i.purchasePrice) < 0)) { setError("Item prices cannot be negative."); return; }

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
      dueDate: dueDate || null,
      category: category || null,
      discount: disc,
      subtotal,
      taxAmount: taxTotal,
      total: grandTotal,
      notes: notes.trim() || null,
      items: billItems,
    };

    if (addPayment && toNum(payAmount) > 0) {
      payload.payment = {
        amount:    toNum(payAmount),
        method:    payMethod,
        reference: payReference.trim() || null,
        date:      payDate,
      };
    }

    setSaving(true); setError("");
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
        setError(data.error ?? "Failed to create purchase bill.");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setSaving(false);
  }

  return (
    <>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    {saving && <OverlayLoader text="Creating bill…" />}
    <div className="page-stack" style={{ maxWidth: "54rem" }}>
      <Breadcrumb items={[{ label: "Purchases", href: "/purchases/bills" }, { label: "New Purchase Bill" }]} />
      <h1 className="page-title">New Purchase Bill</h1>

      {error && <div className="error-banner">{error}</div>}

      {/* ── AI Bill Scanner ── */}
      <div className="card" style={{ padding: "1.25rem", borderLeft: "3px solid var(--c-blue)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--c-text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
              </svg>
              Auto-fill from Bill Photo / PDF
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>
              Upload a photo or PDF of the vendor&apos;s bill — AI will extract and fill the details automatically.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); e.target.value = ""; }}
            />
            <Button
              variant="secondary"
              disabled={scanning}
              onClick={() => fileInputRef.current?.click()}
            >
              {scanning ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <svg style={{ animation: "spin 0.8s linear infinite", width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10"/></svg>
                  Scanning…
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Upload Bill
                </span>
              )}
            </Button>
          </div>
        </div>

        {scanError && (
          <div style={{ marginTop: "0.75rem", padding: "0.625rem 0.875rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "0.8125rem", color: "var(--c-red)" }}>
            {scanError}
          </div>
        )}

        {scanResult && !scanning && (
          <div style={{ marginTop: "0.875rem", padding: "0.875rem 1rem", borderRadius: "0.625rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--c-green-text)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Extracted from bill — review below before saving
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {scanResult.vendorName  && <Pill label="Vendor"   value={scanResult.vendorName} />}
              {scanResult.billNumber  && <Pill label="Bill #"   value={scanResult.billNumber} />}
              {scanResult.billDate    && <Pill label="Date"     value={scanResult.billDate} />}
              {scanResult.category    && <Pill label="Category" value={scanResult.category} />}
              {scanResult.total != null && <Pill label="Total"  value={`₹${scanResult.total}`} />}
              {scanResult.items       && <Pill label="Items"    value={String(scanResult.items.length)} />}
            </div>
            {scanResult.vendorName && !vendors.find(v => v.name.toLowerCase().includes((scanResult.vendorName ?? "").toLowerCase())) && (
              <div style={{ marginTop: "0.625rem", fontSize: "0.75rem", color: "var(--c-amber)" }}>
                ⚠ Vendor &quot;{scanResult.vendorName}&quot; not found in your list — please select manually or{" "}
                <a href="/purchases/vendors/new" target="_blank" rel="noreferrer" style={{ color: "var(--c-blue)", textDecoration: "underline" }}>add the vendor</a>.
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="form-stack">

        {/* Bill Details */}
        <div className="form-card">
          <h2 className="form-section-title">Bill Details</h2>
          <div className="form-grid-2">
            <FormField label="Vendor" required>
              <Select value={vendorId} onChange={e => setVendorId(e.target.value)}>
                <option value="">Select a vendor…</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.company ? ` — ${v.company}` : ""}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Category">
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
          </div>

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 className="form-section-title" style={{ margin: 0 }}>Items</h2>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Item
            </Button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                  {["Product (optional)", "Item Name", "Unit", "Qty", "Rate (₹)", "GST %", "Amount", ""].map(h => (
                    <th key={h} style={{ padding: "0.4rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: h === "Amount" ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { total } = calcItem(item);
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--c-border-light, var(--c-border))" }}>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "150px" }}>
                        <Select sz="sm" value={item.productId} onChange={e => handleProductSelect(idx, e.target.value)}>
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                        </Select>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "150px" }}>
                        <Input sz="sm" value={item.name} onChange={e => handleItemChange(idx, "name", e.target.value)} placeholder="Item name" required />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "90px" }}>
                        <Select sz="sm" value={item.unit} onChange={e => handleItemChange(idx, "unit", e.target.value)}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "70px" }}>
                        <Input sz="sm" type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)} style={{ textAlign: "right" }} />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "90px" }}>
                        <Input sz="sm" type="number" min="0" step="0.01" value={item.purchasePrice} onChange={e => handleItemChange(idx, "purchasePrice", e.target.value)} placeholder="0.00" style={{ textAlign: "right" }} />
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", minWidth: "80px" }}>
                        <Select sz="sm" value={item.gstRate} onChange={e => handleItemChange(idx, "gstRate", e.target.value)}>
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </Select>
                      </td>
                      <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>₹{fmt(total)}</td>
                      <td style={{ padding: "0.4rem 0.25rem" }}>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={items.length <= 1}
                          title="Remove item"
                          style={{ background: "none", border: "none", cursor: items.length <= 1 ? "not-allowed" : "pointer", color: "var(--c-red)", opacity: items.length <= 1 ? 0.3 : 1, padding: "0.25rem", borderRadius: "0.25rem" }}
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

          {/* Totals */}
          <div style={{ borderTop: "1px solid var(--c-border)", marginTop: "1rem", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ width: "min(320px, 100%)" }}>
                {[
                  { label: "Subtotal", value: `₹${fmt(subtotal)}` },
                  { label: "GST",      value: `₹${fmt(taxTotal)}` },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.875rem", color: "var(--c-text-3)" }}>
                    <span>{r.label}</span><span>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.875rem", color: "var(--c-text-3)", alignItems: "center", gap: "0.5rem" }}>
                  <span>Discount (₹)</span>
                  <Input sz="sm" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} style={{ width: "90px", textAlign: "right" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", fontSize: "1rem", fontWeight: 700, borderTop: "1px solid var(--c-border)", marginTop: "0.25rem" }}>
                  <span>Total</span><span>₹{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional Payment */}
        <div className="form-card">
          <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", color: "var(--c-text-2)" }}>
            <input type="checkbox" checked={addPayment} onChange={e => setAddPayment(e.target.checked)} style={{ width: "1rem", height: "1rem", accentColor: "var(--c-blue)", cursor: "pointer" }} />
            Record payment now
          </label>

          {addPayment && (
            <div style={{ marginTop: "1rem", padding: "1rem", borderRadius: "0.625rem", border: "1px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
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
