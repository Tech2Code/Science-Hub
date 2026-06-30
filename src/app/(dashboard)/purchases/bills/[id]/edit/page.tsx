"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface Vendor { id: string; name: string; company: string | null; }
interface PurchaseBill {
  id: string; billNumber: string; vendorId: string; billDate: string; dueDate: string | null;
  category: string | null; notes: string | null; status: string;
  subtotal: number; taxAmount: number; discount: number; total: number; paidAmount: number;
}

const CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
const STATUSES   = ["unpaid", "partial", "paid", "cancelled"];
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function EditPurchaseBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast  = useToast();

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [bill,     setBill]     = useState<PurchaseBill | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // Form fields
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
      setDueDate(b.dueDate ? b.dueDate.slice(0, 10) : "");
      setCategory(b.category ?? "");
      setNotes(b.notes ?? "");
      setStatus(b.status ?? "unpaid");
      setDiscount(String(b.discount ?? 0));
      setLoading(false);
    }).catch(() => { setError("Failed to load bill."); setLoading(false); });
  }, [id]);

  const toNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const computedTotal = bill ? bill.subtotal + bill.taxAmount - toNum(discount) : 0;

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
          dueDate: dueDate || null,
          category: category || null,
          notes: notes.trim() || null,
          status,
          discount: toNum(discount),
          total: computedTotal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
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
  if (error && !bill) return <div className="error-banner" style={{ margin: "2rem" }}>{error}</div>;

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack" style={{ maxWidth: "48rem" }}>
      <Breadcrumb items={[
        { label: "Purchase Bills", href: "/purchases/bills" },
        { label: bill?.billNumber ?? "Bill", href: `/purchases/bills/${id}` },
        { label: "Edit" },
      ]} />

      <div>
        <h1 className="page-title">Edit Purchase Bill</h1>
        <p className="page-sub">{bill?.billNumber} — changes saved immediately</p>
      </div>

      <form onSubmit={handleSubmit} className="form-stack">

        {/* Bill Details */}
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
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </Select>
            </FormField>
          </div>

          <FormField label="Notes">
            <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes about this purchase…" />
          </FormField>
        </div>

        {/* Amount Adjustments */}
        <div className="form-card">
          <h2 className="form-section-title">Amount Adjustments</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", marginBottom: "1rem" }}>
            Line items cannot be changed after creation. You can adjust the discount here.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.875rem", marginBottom: "1rem" }}>
            {[
              { label: "Subtotal",   value: bill ? `₹${fmt(bill.subtotal)}` : "—" },
              { label: "GST",        value: bill ? `₹${fmt(bill.taxAmount)}` : "—" },
              { label: "Amount Paid", value: bill ? `₹${fmt(bill.paidAmount)}` : "—" },
            ].map(s => (
              <div key={s.label} style={{ padding: "0.875rem 1rem", borderRadius: "0.625rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{s.label}</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--c-text-2)" }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ flex: "0 0 180px" }}>
              <FormField label="Discount (₹)">
                <Input
                  type="number" min="0" step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
            </div>
            <div style={{ paddingBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginBottom: "0.25rem" }}>Revised Total</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--c-text)" }}>₹{fmt(computedTotal)}</div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Save Changes
          </Button>
          <Button variant="secondary" href={`/purchases/bills/${id}`}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
    </>
  );
}
