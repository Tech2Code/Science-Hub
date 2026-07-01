"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { StatusBadge } from "@/components/ui/Badge";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface BillItem {
  id: string; name: string; quantity: number; unit: string;
  purchasePrice: number; gstRate: number; gstAmount: number; total: number;
  product: { id: string; name: string } | null;
}
interface PurchaseBill {
  id: string; billNumber: string; vendorId: string; billDate: string; dueDate: string | null;
  category: string | null; notes: string | null; status: string;
  subtotal: number; taxAmount: number; discount: number; total: number; paidAmount: number;
  vendor: { id: string; name: string; company: string | null; gstin: string | null };
  items: BillItem[];
}
interface Vendor { id: string; name: string; company: string | null; }

const CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
const STATUSES   = ["unpaid", "partial", "paid", "cancelled"];
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: "0.875rem 1rem", borderRadius: "0.625rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--c-text-2)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{sub}</div>}
    </div>
  );
}

export default function EditPurchaseBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast  = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bill,    setBill]    = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState("");
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [notes,     setNotes]     = useState("");
  const [status,    setStatus]    = useState("unpaid");
  const [discount,  setDiscount]  = useState("0");

  useEffect(() => {
    Promise.all([
      fetch(`/api/purchase-bills/${id}`).then(r => r.json()),
      fetch("/api/vendors").then(r => r.json()),
    ]).then(([b, v]) => {
      setBill(b);
      setVendors(v);
      setVendorId(b.vendorId ?? "");
      setBillDate(b.billDate ? b.billDate.slice(0, 10) : "");
      setDueDate(b.dueDate  ? b.dueDate.slice(0, 10)  : "");
      setCategory(b.category ?? "");
      setNotes(b.notes ?? "");
      setStatus(b.status ?? "unpaid");
      setDiscount(String(b.discount ?? 0));
      setLoading(false);
    }).catch(() => { setLoadErr("Failed to load bill."); setLoading(false); });
  }, [id]);

  const toNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const computedTotal = bill ? bill.subtotal + bill.taxAmount - toNum(discount) : 0;
  const outstanding   = bill ? computedTotal - bill.paidAmount : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) { toast({ type: "error", title: "Check form", message: "Please select a vendor." }); return; }
    if (!billDate) { toast({ type: "error", title: "Check form", message: "Bill date is required." }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          billDate,
          dueDate:  dueDate || null,
          category: category || null,
          notes:    notes.trim() || null,
          status,
          discount: toNum(discount),
          total:    computedTotal,
        }),
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
  if (loadErr)  return <div className="error-banner" style={{ margin: "2rem" }}>{loadErr}</div>;

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack" style={{ maxWidth: "52rem" }}>
      <Breadcrumb items={[
        { label: "Purchase Bills", href: "/purchases/bills" },
        { label: bill?.billNumber ?? "Bill", href: `/purchases/bills/${id}` },
        { label: "Edit" },
      ]} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 className="page-title">Edit Bill — {bill?.billNumber}</h1>
          <p className="page-sub">{bill?.vendor.name}{bill?.vendor.company ? ` · ${bill.vendor.company}` : ""}</p>
        </div>
        {bill && <StatusBadge status={bill.status} />}
      </div>

      {/* Summary stats */}
      {bill && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
          <StatCard label="Subtotal"    value={`₹${fmt(bill.subtotal)}`} />
          <StatCard label="GST"         value={`₹${fmt(bill.taxAmount)}`} />
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

          <div className="form-grid-2">
            <FormField label="Category">
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </FormField>
        </div>

        {/* Line items — read-only view */}
        {bill && bill.items.length > 0 && (
          <div className="form-card">
            <h2 className="form-section-title">Items <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--c-text-4)", marginLeft: "0.5rem" }}>read-only — cannot be changed after creation</span></h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                    {["Item", "Qty", "Rate", "GST", "Total"].map(h => (
                      <th key={h} style={{ padding: "0.4rem 0.625rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: h === "Total" || h === "Rate" || h === "GST" ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: idx < bill.items.length - 1 ? "1px solid var(--c-border)" : "none" }}>
                      <td style={{ padding: "0.5rem 0.625rem" }}>
                        <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--c-text-2)" }}>{item.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)" }}>{item.unit}</div>
                      </td>
                      <td style={{ padding: "0.5rem 0.625rem", fontSize: "0.875rem", color: "var(--c-text-3)" }}>{item.quantity}</td>
                      <td style={{ padding: "0.5rem 0.625rem", fontSize: "0.875rem", color: "var(--c-text-3)", textAlign: "right" }}>₹{fmt(item.purchasePrice)}</td>
                      <td style={{ padding: "0.5rem 0.625rem", fontSize: "0.875rem", color: "var(--c-text-3)", textAlign: "right" }}>{item.gstRate}%</td>
                      <td style={{ padding: "0.5rem 0.625rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", textAlign: "right" }}>₹{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Discount & revised total */}
        <div className="form-card">
          <h2 className="form-section-title">Discount Adjustment</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "2rem", flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 200px" }}>
              <FormField label="Discount (₹)">
                <Input
                  type="number" min="0" step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
            </div>
            <div style={{ paddingBottom: "0.75rem", borderLeft: "2px solid var(--c-border)", paddingLeft: "2rem" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Revised Total</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em" }}>₹{fmt(computedTotal)}</div>
              {bill && toNum(discount) > 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>
                  ₹{fmt(bill.subtotal + bill.taxAmount)} − ₹{fmt(toNum(discount))} discount
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
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
