"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/Badge";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

interface PurchaseBillItem {
  id: string; name: string; unit: string; quantity: number;
  purchasePrice: number; gstRate: number; gstAmount: number; total: number;
  product: { id: string; name: string } | null;
}
interface PurchasePayment {
  id: string; amount: number; method: string; reference: string | null; date: string; notes: string | null;
}
interface PurchaseBill {
  id: string; billNumber: string; billDate: string; dueDate: string | null;
  status: string; category: string | null; notes: string | null;
  subtotal: number; taxAmount: number; discount: number; total: number; paidAmount: number;
  vendor: { id: string; name: string; company: string | null; gstin: string | null; phone: string | null; email: string | null; address: string | null; };
  createdBy: { id: string; name: string };
  items: PurchaseBillItem[];
  payments: PurchasePayment[];
}

const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function PurchaseBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast   = useToast();

  const [bill,    setBill]    = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Payment form
  const [showPayForm, setShowPayForm]   = useState(false);
  const [payAmount,   setPayAmount]     = useState("");
  const [payMethod,   setPayMethod]     = useState("Cash");
  const [payRef,      setPayRef]        = useState("");
  const [payDate,     setPayDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [payNotes,    setPayNotes]      = useState("");
  const [payError,    setPayError]      = useState("");
  const [submitting,  setSubmitting]    = useState(false);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Confirm cancel
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling,    setCancelling]    = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/purchase-bills/${id}`)
      .then(r => r.json())
      .then(d => { setBill(d); setLoading(false); })
      .catch(() => { setError("Failed to load purchase bill."); setLoading(false); });
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!bill) return;
    const amount = parseFloat(payAmount);
    const balance = bill.total - bill.paidAmount;
    if (!payAmount || isNaN(amount) || amount <= 0) { setPayError("Enter a valid amount."); return; }
    if (amount > balance + 0.01) { setPayError(`Amount exceeds outstanding balance of ₹${fmt(balance)}.`); return; }
    setSubmitting(true); setPayError("");
    try {
      const res = await fetch(`/api/purchase-bills/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method: payMethod, reference: payRef.trim() || null, date: payDate, notes: payNotes.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
        toast({ type: "success", title: "Payment recorded", message: `₹${fmt(amount)} via ${payMethod}.` });
        setShowPayForm(false);
        setPayAmount(""); setPayRef(""); setPayNotes("");
        load();
      } else {
        setPayError(data.error ?? "Failed to record payment.");
      }
    } catch {
      setPayError("Network error — please try again.");
    }
    setSubmitting(false);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        bustCache("/api/purchase-bills");
        toast({ type: "success", title: "Bill cancelled", message: "Status updated to cancelled." });
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d.error ?? "Could not cancel bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setCancelling(false);
    setConfirmCancel(false);
  }

  if (loading) return <div className="loading-center">Loading purchase bill…</div>;
  if (error || !bill) return <div className="error-banner" style={{ margin: "2rem" }}>{error || "Bill not found."}</div>;

  const balance  = bill.total - bill.paidAmount;
  const isOverdue = bill.status !== "paid" && bill.status !== "cancelled" && bill.dueDate && new Date(bill.dueDate) < new Date();

  return (
    <>
    {(submitting || updatingStatus || cancelling) && <OverlayLoader text="Saving…" />}

    <ConfirmDialog
      open={confirmCancel}
      title="Cancel Purchase Bill"
      message={`Cancel bill ${bill.billNumber}? This action cannot be undone.`}
      confirmLabel="Cancel Bill"
      variant="danger"
      loading={cancelling}
      onConfirm={handleCancel}
      onCancel={() => { if (!cancelling) setConfirmCancel(false); }}
    />

    <div className="page-stack">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <Breadcrumb items={[{ label: "Purchases", href: "/purchases/bills" }, { label: bill.billNumber }]} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.375rem" }}>
            <h1 className="page-title" style={{ margin: 0 }}>{bill.billNumber}</h1>
            <StatusBadge status={bill.status} />
            {isOverdue && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--c-red)", background: "var(--c-red-bg, rgba(239,68,68,0.1))", padding: "0.1rem 0.5rem", borderRadius: "9999px" }}>OVERDUE</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {bill.status !== "paid" && bill.status !== "cancelled" && (
            <Button variant="primary" size="sm" onClick={() => { setShowPayForm(v => !v); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {showPayForm ? "Hide Payment" : "Record Payment"}
            </Button>
          )}
          {bill.status !== "cancelled" && (
            <Button variant="dangerOutline" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancel Bill
            </Button>
          )}
        </div>
      </div>

      {/* Payment form */}
      {showPayForm && bill.status !== "paid" && bill.status !== "cancelled" && (
        <div className="card" style={{ borderLeft: "3px solid var(--c-blue)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--c-text-2)", marginBottom: "1rem" }}>
            Record Payment — Balance: ₹{fmt(balance)}
          </h3>
          {payError && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{payError}</div>}
          <form onSubmit={handlePayment}>
            <div className="form-grid-2" style={{ marginBottom: "0.75rem" }}>
              <FormField label="Amount (₹)">
                <Input type="number" min="0.01" step="0.01" max={balance} value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} placeholder={`Max ₹${fmt(balance)}`} autoFocus />
              </FormField>
              <FormField label="Date">
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </FormField>
            </div>
            <div className="form-grid-2" style={{ marginBottom: "0.75rem" }}>
              <FormField label="Method">
                <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Reference / UTR">
                <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Cheque no., UTR…" />
              </FormField>
            </div>
            <div className="form-actions" style={{ marginTop: "0.5rem" }}>
              <Button type="submit" variant="primary" disabled={submitting}>Save Payment</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowPayForm(false); setPayError(""); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {/* Vendor info */}
        <div className="card">
          <h3 className="card-section-label">Vendor</h3>
          <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--c-text)", marginBottom: "0.25rem" }}>{bill.vendor.name}</div>
          {bill.vendor.company && <div style={{ fontSize: "0.8rem", color: "var(--c-text-3)" }}>{bill.vendor.company}</div>}
          {bill.vendor.gstin && <div style={{ fontSize: "0.8rem", color: "var(--c-text-4)", fontFamily: "var(--font-mono)", marginTop: "0.25rem" }}>GSTIN: {bill.vendor.gstin}</div>}
          {bill.vendor.phone && <div style={{ fontSize: "0.8rem", color: "var(--c-text-3)", marginTop: "0.25rem" }}>📞 {bill.vendor.phone}</div>}
          {bill.vendor.email && <div style={{ fontSize: "0.8rem", color: "var(--c-text-3)" }}>✉ {bill.vendor.email}</div>}
          {bill.vendor.address && <div style={{ fontSize: "0.8rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>{bill.vendor.address}</div>}
        </div>

        {/* Bill info */}
        <div className="card">
          <h3 className="card-section-label">Bill Info</h3>
          {[
            { label: "Bill Date",   value: fmtDate(bill.billDate) },
            { label: "Due Date",    value: bill.dueDate ? fmtDate(bill.dueDate) : "—" },
            { label: "Category",   value: bill.category || "—" },
            { label: "Created By", value: bill.createdBy.name },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: "0.875rem", borderBottom: "1px solid var(--c-border-light, var(--c-border))" }}>
              <span style={{ color: "var(--c-text-4)" }}>{r.label}</span>
              <span style={{ fontWeight: 500, color: "var(--c-text-2)" }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Amount summary */}
        <div className="card">
          <h3 className="card-section-label">Amount Summary</h3>
          {[
            { label: "Subtotal",  value: `₹${fmt(bill.subtotal)}`,                   bold: false },
            { label: "GST",       value: `₹${fmt(bill.taxAmount)}`,                   bold: false },
            { label: "Discount",  value: bill.discount > 0 ? `-₹${fmt(bill.discount)}` : "—", bold: false },
            { label: "Total",     value: `₹${fmt(bill.total)}`,                       bold: true  },
            { label: "Paid",      value: `₹${fmt(bill.paidAmount)}`,                  bold: false },
            { label: "Balance",   value: `₹${fmt(balance)}`,                          bold: balance > 0 },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", fontSize: r.bold ? "1rem" : "0.875rem", borderBottom: "1px solid var(--c-border-light, var(--c-border))", fontWeight: r.bold ? 700 : 400 }}>
              <span style={{ color: "var(--c-text-4)" }}>{r.label}</span>
              <span style={{ color: r.label === "Balance" && balance > 0 ? "var(--c-amber)" : r.label === "Paid" ? "var(--c-green-text)" : "var(--c-text-2)" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Items table */}
      <div className="card">
        <h3 className="card-section-label">Items</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table-base" style={{ minWidth: "520px" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>GST %</th>
                <th style={{ textAlign: "right" }}>GST Amt</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--c-text-4)", width: "2rem" }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>{item.unit}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>₹{fmt(item.purchasePrice)}</td>
                  <td style={{ textAlign: "right" }}>{item.gstRate}%</td>
                  <td style={{ textAlign: "right", color: "var(--c-text-3)" }}>₹{fmt(item.gstAmount)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>₹{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--c-border)", fontWeight: 700 }}>
                <td colSpan={6} style={{ textAlign: "right", paddingRight: "1rem", color: "var(--c-text-3)", fontSize: "0.875rem" }}>Grand Total</td>
                <td style={{ textAlign: "right" }}>₹{fmt(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {bill.notes && (
          <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "var(--c-bg-sub)", color: "var(--c-text-3)", fontSize: "0.875rem", borderLeft: "3px solid var(--c-border)" }}>
            <span style={{ fontWeight: 600, color: "var(--c-text-4)", marginRight: "0.5rem" }}>Notes:</span>
            {bill.notes}
          </div>
        )}
      </div>

      {/* Payments history */}
      <div className="card">
        <h3 className="card-section-label">Payment History</h3>
        {bill.payments.length === 0 ? (
          <p style={{ color: "var(--c-text-4)", fontSize: "0.875rem", padding: "0.5rem 0" }}>No payments recorded yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table-base" style={{ minWidth: "400px" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{fmtDate(p.date)}</td>
                    <td><span style={{ fontWeight: 500 }}>{p.method}</span></td>
                    <td style={{ color: "var(--c-text-4)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>{p.reference || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--c-green-text)" }}>₹{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--c-border)", fontWeight: 700 }}>
                  <td colSpan={3} style={{ textAlign: "right", paddingRight: "1rem", color: "var(--c-text-3)", fontSize: "0.875rem" }}>Total Paid</td>
                  <td style={{ textAlign: "right", color: "var(--c-green-text)" }}>₹{fmt(bill.paidAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {balance > 0 && bill.status !== "cancelled" && (
          <div style={{ marginTop: "0.75rem", padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "var(--c-amber-bg, rgba(245,158,11,0.08))", border: "1px solid var(--c-amber)", fontSize: "0.875rem", fontWeight: 600, color: "var(--c-amber)" }}>
            Outstanding balance: ₹{fmt(balance)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button variant="secondary" href="/purchases/bills">← Back to Purchases</Button>
      </div>
    </div>
    </>
  );
}
