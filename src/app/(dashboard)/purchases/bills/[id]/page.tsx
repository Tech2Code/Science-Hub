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
import styles from "./billDetail.module.css";

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
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoRowLabel}>{label}</span>
      <span className={`${styles.infoRowValue} ${mono ? styles.infoRowValueMono : ""}`}>{value}</span>
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
    if (!payAmount || isNaN(amount) || amount <= 0) { toast({ type: "error", title: "Check form", message: "Enter a valid amount." }); return; }
    if (amount > balance + 0.01) { toast({ type: "error", title: "Check form", message: `Amount exceeds outstanding balance of ₹${fmt(balance)}.` }); return; }
    setSubmitting(true);
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
        toast({ type: "error", title: "Failed", message: data.error ?? "Failed to record payment." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
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
    <div className={`page-stack ${styles.pageStack}`}>
      {[120, 80, 200, 300].map((h, i) => (
        <div key={i} className={styles.skeletonBlock} style={{ height: h }} />
      ))}
    </div>
  );
  if (error || !bill) return <div className={`error-banner ${styles.errorBanner}`}>{error || "Bill not found."}</div>;

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

    <div className={`page-stack ${styles.pageStack}`}>

      {/* ── Breadcrumb + toolbar ── */}
      <div className={styles.toolbarRow}>
        <div>
          <Breadcrumb items={[{ label: "Purchase Bills", href: "/purchases/bills" }, { label: bill.billNumber }]} />
          <div className={styles.titleRow}>
            <h1 className={`page-title ${styles.titleNoMargin}`}>{bill.billNumber}</h1>
            <StatusBadge status={bill.status} />
            {isOverdue && (
              <span className={styles.overdueBadge}>
                OVERDUE
              </span>
            )}
          </div>
        </div>
        <div className={styles.toolbarActions}>
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
      <div className={styles.statStrip}>
        <StatCard label="Subtotal"    value={`₹${fmtShort(bill.subtotal)}`} />
        <StatCard label="GST"         value={`₹${fmtShort(bill.taxAmount)}`} />
        {bill.discount > 0 && <StatCard label="Discount" value={`−₹${fmtShort(bill.discount)}`} color="var(--c-red)" />}
        <StatCard label="Total"       value={`₹${fmtShort(bill.total)}`}     color="var(--c-text)" />
        <StatCard label="Paid"        value={`₹${fmtShort(bill.paidAmount)}`} color="var(--c-green-text)" sub={`${bill.payments.length} payment(s)`} />
        <StatCard label="Balance Due" value={`₹${fmtShort(balance)}`}        color={balance > 0 ? "var(--c-amber)" : "var(--c-green-text)"} />
      </div>

      {/* ── Info cards: Vendor | Bill Meta ── */}
      <div className={styles.infoGrid}>
        {/* Vendor */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.infoCardLabel}>Vendor</div>
          <Link
            href={`/purchases/vendors/${bill.vendor.id}`}
            className={styles.vendorName}
          >
            {bill.vendor.name}
          </Link>
          {bill.vendor.company && (
            <div className={styles.vendorCompany}>{bill.vendor.company}</div>
          )}
          <div className={styles.vendorDetails}>
            {bill.vendor.gstin && (
              <div className={styles.vendorGstin}>
                GSTIN: {bill.vendor.gstin}
              </div>
            )}
            {bill.vendor.phone && (
              <div className={styles.vendorContactLine}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 10.66 19.79 19.79 0 011.62 2.05 2 2 0 013.62 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.91 7.91a16 16 0 006.18 6.18l.95-.95a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.32z"/></svg>
                {bill.vendor.phone}
              </div>
            )}
            {bill.vendor.email && (
              <div className={styles.vendorContactLine}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {bill.vendor.email}
              </div>
            )}
            {bill.vendor.address && (
              <div className={styles.vendorAddress}>{bill.vendor.address}</div>
            )}
            {!bill.vendor.gstin && !bill.vendor.phone && !bill.vendor.email && !bill.vendor.address && (
              <div className={styles.vendorNoContact}>No contact details on file</div>
            )}
          </div>
        </div>

        {/* Bill Meta */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.infoCardLabel}>Bill Information</div>
          <InfoRow label="Bill Date"   value={fmtDate(bill.billDate)} />
          <InfoRow label="Due Date"    value={bill.dueDate ? fmtDate(bill.dueDate) : "Not set"} />
          <InfoRow label="Category"    value={bill.category || "—"} />
          <InfoRow label="Created By"  value={bill.createdBy.name} />
          {bill.notes && (
            <div className={styles.billNote}>
              <span className={styles.billNoteLabel}>Note:</span>{bill.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Record Payment form ── */}
      {showPayForm && bill.status !== "paid" && bill.status !== "cancelled" && (
        <div className={`card ${styles.payFormCard}`}>
          <div className={styles.payFormHeaderRow}>
            <h3 className={styles.payFormHeading}>
              Record Payment
              <span className={styles.payFormBalanceInline}>
                Balance: ₹{fmt(balance)}
              </span>
            </h3>
          </div>
          <form onSubmit={handlePayment}>
            <div className={`form-grid-2 ${styles.marginBottom075}`}>
              <FormField label="Amount (₹)" required>
                <div className={styles.amountRow}>
                  <Input type="number" min="0.01" step="0.01" max={balance}
                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    placeholder={`Max ₹${fmt(balance)}`} autoFocus className={styles.amountInput} />
                  <button
                    type="button"
                    onClick={() => setPayAmount(balance.toFixed(2))}
                    title="Fill full outstanding balance"
                    className={styles.payFullBtn}
                  >
                    Pay Full
                  </button>
                </div>
                <p className={styles.outstandingHint}>
                  Outstanding: <strong className={styles.outstandingHintStrong}>₹{fmt(balance)}</strong>
                </p>
              </FormField>
              <FormField label="Date">
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </FormField>
            </div>
            <div className={`form-grid-2 ${styles.marginBottom1}`}>
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
              <Button type="button" variant="secondary" onClick={() => { setShowPayForm(false); }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Items table ── */}
      <div className="card">
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionHeading}>
            Items <span className={styles.sectionCount}>({bill.items.length})</span>
          </h3>
        </div>
        <div className={styles.tableScroll}>
          <table className={`table-base ${styles.itemsTable}`}>
            <thead>
              <tr>
                <th className={styles.colNum}>#</th>
                <th>Item</th>
                <th className={styles.textRight}>Qty</th>
                <th className={styles.textRight}>Rate</th>
                <th className={styles.textRight}>GST %</th>
                <th className={styles.textRight}>GST Amt</th>
                <th className={styles.textRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className={styles.textMuted}>{idx + 1}</td>
                  <td>
                    <div className={styles.itemName}>{item.name}</div>
                    <div className={styles.itemUnit}>{item.unit}</div>
                  </td>
                  <td className={styles.qtyCell}>{item.quantity}</td>
                  <td className={styles.textRight}>₹{fmt(item.purchasePrice)}</td>
                  <td className={`${styles.textRight} ${styles.textMuted}`}>{item.gstRate}%</td>
                  <td className={styles.gstAmtCell}>₹{fmt(item.gstAmount)}</td>
                  <td className={styles.totalCell}>₹{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.tfootRow}>
                <td colSpan={6} className={styles.tfootLabelCell}>Grand Total</td>
                <td className={styles.tfootValueCell}>₹{fmt(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Payment History ── */}
      <div className="card">
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionHeading}>
            Payment History
            {bill.payments.length > 0 && (
              <span className={styles.sectionCount}>({bill.payments.length})</span>
            )}
          </h3>
          {balance > 0 && bill.status !== "cancelled" && (
            <span className={styles.outstandingPill}>
              ₹{fmt(balance)} outstanding
            </span>
          )}
          {balance === 0 && (
            <span className={styles.fullyPaidPill}>
              Fully paid
            </span>
          )}
        </div>
        {bill.payments.length === 0 ? (
          <div className={styles.emptyPayments}>
            No payments recorded yet.
            {bill.status !== "paid" && bill.status !== "cancelled" && (
              <div className={styles.emptyPaymentsAction}>
                <button
                  onClick={() => setShowPayForm(true)}
                  className={styles.linkButton}
                >
                  Record a payment →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={`table-base ${styles.paymentsTable}`}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className={styles.textRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.payments.map(p => (
                  <tr key={p.id}>
                    <td className={styles.paymentDateCell}>{fmtDate(p.date)}</td>
                    <td>
                      <span className={styles.methodPill}>
                        {p.method}
                      </span>
                    </td>
                    <td className={styles.referenceCell}>{p.reference || "—"}</td>
                    <td className={styles.paymentAmountCell}>₹{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.tfootRow}>
                  <td colSpan={3} className={styles.tfootLabelCell}>Total Paid</td>
                  <td className={styles.tfootPaidValueCell}>₹{fmt(bill.paidAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className={styles.footerActions}>
        <Button variant="secondary" href="/purchases/bills">← Back to Bills</Button>
      </div>
    </div>
    </>
  );
}
