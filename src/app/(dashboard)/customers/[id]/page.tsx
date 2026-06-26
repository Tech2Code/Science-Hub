"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import styles from "./view.module.css";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { fetchCached } from "@/lib/useCache";

interface Invoice {
  id: string; invoiceNumber: string; date: string; createdAt: string;
  total: number; paidAmount: number; status: string;
}
interface Customer {
  id: string; name: string; phone: string; email: string;
  address: string; city: string; state: string; pincode: string;
  gstin: string; invoices: Invoice[];
}

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "var(--c-border)",
      animation: "skPulse 1.4s ease-in-out infinite",
    }} />
  );
}

export default function CustomerViewPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCached(`/api/customers/${id}`)
      .then((d) => { setCustomer(d as typeof customer); setLoading(false); })
      .catch(() => { setError("Customer not found."); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="page-stack" style={{ maxWidth: "56rem" }}>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      {/* Breadcrumb */}
      <Sk w={160} h={13} />

      {/* Header card */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Sk w={48} h={48} r={9999} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Sk w={160} h={20} />
              <Sk w={220} h={13} />
              <Sk w={120} h={20} r={6} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Sk w={72} h={32} r={8} />
            <Sk w={110} h={32} r={8} />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className={styles.statsGrid}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <Sk w={80} h={11} />
            <Sk w={120} h={22} />
            <Sk w={60} h={11} />
          </div>
        ))}
      </div>

      {/* Invoice history table */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
          <Sk w={120} h={14} />
        </div>
        <div className="table-wrap">
          <table className="table-base"><tbody><TableSkeleton cols={6} rows={4} /></tbody></table>
        </div>
      </div>
    </div>
  );
  if (error || !customer)
    return <div className="loading-center" style={{ color: "var(--c-red)" }}>{error || "Customer not found."}</div>;

  const totalBilled = customer.invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid   = customer.invoices.reduce((s, i) => s + i.paidAmount, 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="page-stack" style={{ maxWidth: "56rem" }}>
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: customer.name }]} />

      {/* Header */}
      <div className={`card ${styles.headerCard}`}>
        <div className={styles.headerTop}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className={styles.avatar}>{customer.name[0]?.toUpperCase()}</div>
            <div>
              <h1 className="page-title">{customer.name}</h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.25rem" }}>
                {customer.phone && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{customer.phone}</span>}
                {customer.email && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{customer.email}</span>}
                {customer.city  && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{[customer.city, customer.state].filter(Boolean).join(", ")}</span>}
              </div>
              {customer.gstin && (
                <code style={{ marginTop: "0.375rem", display: "inline-block", fontSize: "0.75rem", background: "var(--c-bg-sub)", color: "var(--c-text-2)", padding: "0.125rem 0.5rem", borderRadius: "0.375rem", fontFamily: "var(--font-mono)", border: "1px solid var(--c-border)" }}>
                  GSTIN: {customer.gstin}
                </code>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="secondary" href={`/customers/edit/${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
            <Button variant="primary" href={`/invoices/new?customerId=${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
          </div>
        </div>
        {customer.address && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--c-border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Address</div>
            <p style={{ fontSize: "0.875rem", color: "var(--c-text-2)" }}>
              {customer.address}
              {[customer.city, customer.state, customer.pincode].filter(Boolean).length > 0 && (
                <>, {[customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")}</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { label: "Total Billed", value: `₹${totalBilled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, sub: `${customer.invoices.length} invoice(s)`, color: "var(--c-text)" },
          { label: "Total Paid",   value: `₹${totalPaid.toLocaleString("en-IN",   { minimumFractionDigits: 2 })}`, color: "var(--c-green)" },
          { label: "Outstanding",  value: `₹${outstanding.toLocaleString("en-IN",  { minimumFractionDigits: 2 })}`, color: outstanding > 0 ? "var(--c-red)" : "var(--c-green)" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{s.label}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)", marginTop: "0.125rem" }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Invoice history */}
      <div className="card">
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--c-border)" }}>
          <h2 style={{ fontWeight: 600, color: "var(--c-text)", fontSize: "0.875rem" }}>Invoice History</h2>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customer.invoices.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "2.5rem", color: "var(--c-text-4)" }}>No invoices yet.</td></tr>
              ) : customer.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td data-mobile-full>
                    <Link href={`/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td data-label="Date" style={{ color: "var(--c-text-3)" }}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className="date-sub" style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </td>
                  <td data-label="Total" className="table-td-right" style={{ color: "var(--c-text)" }}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Balance" className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Status"><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
