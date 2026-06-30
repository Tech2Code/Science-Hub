"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
const fmt     = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
const fmtShort = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function StatCard({ label, value, color = "var(--c-text)", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "1rem 1.125rem", borderRadius: "0.75rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)" }}>
      <div style={{ fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-4)", marginBottom: "0.375rem" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.425rem 0", borderBottom: "1px solid var(--c-border-light, rgba(255,255,255,0.05))" }}>
      <span style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", flexShrink: 0, marginRight: "1rem" }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--c-text-2)", textAlign: "right", fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</span>
    </div>
  );
}

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
  const [payError,    setPayError]      = useState("");
  const [submitting,  setSubmitting]    = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmCancel,  setConfirmCancel]  = useState(false);
  const [cancelling,     setCancelling]     = useState(false);

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
    const amount  = parseFloat(payAmount);
    const balance = bill.total - bill.paidAmount;
    if (!payAmount || isNaN(amount) || amount <= 0) { setPayError("Enter a valid amount."); return; }
    if (amount > balance + 0.01) { setPayError(`Amount exceeds outstanding balance of ₹${fmt(balance)}.`); return; }
    setSubmitting(true); setPayError("");
    try {
      const res = await fetch(`/api/purchase-bills/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method: payMethod, reference: payRef.trim() || null, date: payDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
        toast({ type: "success", title: "Payment recorded", message: `₹${fmt(amount)} via ${payMethod}.` });
        setShowPayForm(false);
        setPayAmount(""); setPayRef("");
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

  if (loading) return (
    <div className="page-stack" style={{ maxWidth: "58rem" }}>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      {[120, 80, 200, 300].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 12, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />
      ))}
    </div>
  );
  if (error || !bill) return <div className="error-banner" style={{ margin: "2rem" }}>{error || "Bill not found."}</div>;

  const balance   = bill.total - bill.paidAmount;
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

    <div className="page-stack" style={{ maxWidth: "58rem" }}>

      {/* ── Breadcrumb + toolbar ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <Breadcrumb items={[{ label: "Purchase Bills", href: "/purchases/bills" }, { label: bill.billNumber }]} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap", marginTop: "0.375rem" }}>
            <h1 className="page-title" style={{ margin: 0 }}>{bill.billNumber}</h1>
            <StatusBadge status={bill.status} />
            {isOverdue && (
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--c-red)", background: "rgba(239,68,68,0.1)", padding: "0.15rem 0.55rem", borderRadius: "9999px", border: "1px solid rgba(239,68,68,0.25)" }}>
                OVERDUE
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" href={`/purchases/bills/${bill.id}/edit`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </Button>
          {bill.status !== "paid" && bill.status !== "cancelled" && (
            <Button variant="primary" size="sm" onClick={() => setShowPayForm(v => !v)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {showPayForm ? "Hide Payment" : "Record Payment"}
            </Button>
          )}
          {bill.status !== "cancelled" && (
            <Button variant="dangerOutline" size="sm" onClick={() => setConfirmCancel(true)}>Cancel Bill</Button>
          )}
        </div>
      </div>

      {/* ── KPI stat strip ── */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <StatCard label="Subtotal"    value={`₹${fmtShort(bill.subtotal)}`} />
        <StatCard label="GST"         value={`₹${fmtShort(bill.taxAmount)}`} />
        {bill.discount > 0 && <StatCard label="Discount" value={`−₹${fmtShort(bill.discount)}`} color="var(--c-red)" />}
        <StatCard label="Total"       value={`₹${fmtShort(bill.total)}`}     color="var(--c-text)" />
        <StatCard label="Paid"        value={`₹${fmtShort(bill.paidAmount)}`} color="var(--c-green-text)" sub={`${bill.payments.length} payment(s)`} />
        <StatCard label="Balance Due" value={`₹${fmtShort(balance)}`}        color={balance > 0 ? "var(--c-amber)" : "var(--c-green-text)"} />
      </div>

      {/* ── Info cards: Vendor | Bill Meta ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        {/* Vendor */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-4)", marginBottom: "0.625rem" }}>Vendor</div>
          <Link
            href={`/purchases/vendors/${bill.vendor.id}`}
            style={{ fontWeight: 700, fontSize: "1rem", color: "var(--c-blue)", textDecoration: "none", display: "block", marginBottom: "0.125rem" }}
          >
            {bill.vendor.name}
          </Link>
          {bill.vendor.company && (
            <div style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", marginBottom: "0.5rem" }}>{bill.vendor.company}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", marginTop: "0.5rem" }}>
            {bill.vendor.gstin && (
              <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", fontFamily: "var(--font-mono)" }}>
                GSTIN: {bill.vendor.gstin}
              </div>
            )}
            {bill.vendor.phone && (
              <div style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 10.66 19.79 19.79 0 011.62 2.05 2 2 0 013.62 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.91 7.91a16 16 0 006.18 6.18l.95-.95a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.32z"/></svg>
                {bill.vendor.phone}
              </div>
            )}
            {bill.vendor.email && (
              <div style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {bill.vendor.email}
              </div>
            )}
            {bill.vendor.address && (
              <div style={{ fontSize: "0.8rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>{bill.vendor.address}</div>
            )}
            {!bill.vendor.gstin && !bill.vendor.phone && !bill.vendor.email && !bill.vendor.address && (
              <div style={{ fontSize: "0.8125rem", color: "var(--c-text-4)", fontStyle: "italic" }}>No contact details on file</div>
            )}
          </div>
        </div>

        {/* Bill Meta */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ fontSize: "0.69rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--c-text-4)", marginBottom: "0.625rem" }}>Bill Information</div>
          <InfoRow label="Bill Date"   value={fmtDate(bill.billDate)} />
          <InfoRow label="Due Date"    value={bill.dueDate ? fmtDate(bill.dueDate) : "Not set"} />
          <InfoRow label="Category"    value={bill.category || "—"} />
          <InfoRow label="Created By"  value={bill.createdBy.name} />
          {bill.notes && (
            <div style={{ marginTop: "0.75rem", padding: "0.625rem 0.75rem", borderRadius: "0.5rem", background: "var(--c-bg-sub)", fontSize: "0.8125rem", color: "var(--c-text-3)", borderLeft: "2px solid var(--c-border)" }}>
              <span style={{ fontWeight: 600, color: "var(--c-text-4)", marginRight: "0.375rem" }}>Note:</span>{bill.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Record Payment form ── */}
      {showPayForm && bill.status !== "paid" && bill.status !== "cancelled" && (
        <div className="card" style={{ borderLeft: "3px solid var(--c-blue)", padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--c-text-2)", margin: 0 }}>
              Record Payment
              <span style={{ marginLeft: "0.75rem", fontSize: "0.8125rem", fontWeight: 500, color: "var(--c-amber)" }}>
                Balance: ₹{fmt(balance)}
              </span>
            </h3>
          </div>
          {payError && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{payError}</div>}
          <form onSubmit={handlePayment}>
            <div className="form-grid-2" style={{ marginBottom: "0.75rem" }}>
              <FormField label="Amount (₹)" required>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <Input type="number" min="0.01" step="0.01" max={balance}
                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    placeholder={`Max ₹${fmt(balance)}`} autoFocus style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setPayAmount(balance.toFixed(2))}
                    title="Fill full outstanding balance"
                    style={{
                      flexShrink: 0, padding: "0 0.75rem", height: "2.25rem",
                      borderRadius: "0.5rem", border: "1px solid var(--c-amber)",
                      background: "rgba(245,158,11,0.1)", color: "var(--c-amber)",
                      fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                      whiteSpace: "nowrap", transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.1)")}
                  >
                    Pay Full
                  </button>
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--c-text-4)", marginTop: "0.25rem" }}>
                  Outstanding: <strong style={{ color: "var(--c-amber)" }}>₹{fmt(balance)}</strong>
                </p>
              </FormField>
              <FormField label="Date">
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </FormField>
            </div>
            <div className="form-grid-2" style={{ marginBottom: "1rem" }}>
              <FormField label="Method">
                <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Reference / UTR">
                <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Cheque no., UTR, etc." />
              </FormField>
            </div>
            <div className="form-actions">
              <Button type="submit" variant="primary" disabled={submitting}>Save Payment</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowPayForm(false); setPayError(""); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Items table ── */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text-2)", margin: 0 }}>
            Items <span style={{ fontSize: "0.75rem", color: "var(--c-text-4)", fontWeight: 400, marginLeft: "0.375rem" }}>({bill.items.length})</span>
          </h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table-base" style={{ minWidth: "520px" }}>
            <thead>
              <tr>
                <th style={{ width: "2.5rem" }}>#</th>
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
                  <td style={{ color: "var(--c-text-4)" }}>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--c-text)" }}>{item.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginTop: "0.1rem" }}>{item.unit}</div>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>₹{fmt(item.purchasePrice)}</td>
                  <td style={{ textAlign: "right", color: "var(--c-text-4)" }}>{item.gstRate}%</td>
                  <td style={{ textAlign: "right", color: "var(--c-text-3)" }}>₹{fmt(item.gstAmount)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>₹{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--c-border)" }}>
                <td colSpan={6} style={{ textAlign: "right", color: "var(--c-text-3)", fontSize: "0.8125rem", fontWeight: 600, padding: "0.625rem 0.75rem 0.625rem 0" }}>Grand Total</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontSize: "1rem" }}>₹{fmt(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Payment History ── */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text-2)", margin: 0 }}>
            Payment History
            {bill.payments.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--c-text-4)", fontWeight: 400, marginLeft: "0.375rem" }}>({bill.payments.length})</span>
            )}
          </h3>
          {balance > 0 && bill.status !== "cancelled" && (
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--c-amber)", background: "rgba(245,158,11,0.1)", border: "1px solid var(--c-amber)", padding: "0.15rem 0.625rem", borderRadius: "9999px" }}>
              ₹{fmt(balance)} outstanding
            </span>
          )}
          {balance === 0 && (
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--c-green-text)", background: "var(--c-green-bg)", border: "1px solid var(--c-green-border, #bbf7d0)", padding: "0.15rem 0.625rem", borderRadius: "9999px" }}>
              Fully paid
            </span>
          )}
        </div>
        {bill.payments.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--c-text-4)", fontSize: "0.875rem" }}>
            No payments recorded yet.
            {bill.status !== "paid" && bill.status !== "cancelled" && (
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  onClick={() => setShowPayForm(true)}
                  style={{ background: "none", border: "none", color: "var(--c-blue)", cursor: "pointer", fontSize: "0.875rem", textDecoration: "underline" }}
                >
                  Record a payment →
                </button>
              </div>
            )}
          </div>
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
                    <td>
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", background: "var(--c-bg-sub)", border: "1px solid var(--c-border)", padding: "0.1rem 0.5rem", borderRadius: "0.375rem" }}>
                        {p.method}
                      </span>
                    </td>
                    <td style={{ color: "var(--c-text-4)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>{p.reference || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--c-green-text)" }}>₹{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--c-border)" }}>
                  <td colSpan={3} style={{ textAlign: "right", color: "var(--c-text-3)", fontSize: "0.8125rem", fontWeight: 600, padding: "0.625rem 0.75rem 0.625rem 0" }}>Total Paid</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--c-green-text)" }}>₹{fmt(bill.paidAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button variant="secondary" href="/purchases/bills">← Back to Bills</Button>
      </div>
    </div>
    </>
  );
}
