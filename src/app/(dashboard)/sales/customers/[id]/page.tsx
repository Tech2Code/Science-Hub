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
    <div
      className={styles.skeletonBlock}
      style={{ width: w, height: h, borderRadius: r } as React.CSSProperties}
    />
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
    <div className={`page-stack ${styles.pageStack}`}>
      {/* Breadcrumb */}
      <Sk w={160} h={13} />

      {/* Header card */}
      <div className={`card ${styles.cardPad}`}>
        <div className={styles.skRow}>
          <div className={styles.skLeftRow}>
            <Sk w={48} h={48} r={9999} />
            <div className={styles.skCol}>
              <Sk w={160} h={20} />
              <Sk w={220} h={13} />
              <Sk w={120} h={20} r={6} />
            </div>
          </div>
          <div className={styles.skActions}>
            <Sk w={72} h={32} r={8} />
            <Sk w={110} h={32} r={8} />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className={styles.statsGrid}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`card ${styles.skStatCard}`}>
            <Sk w={80} h={11} />
            <Sk w={120} h={22} />
            <Sk w={60} h={11} />
          </div>
        ))}
      </div>

      {/* Invoice history table */}
      <div className="card">
        <div className={styles.skTableHead}>
          <Sk w={120} h={14} />
        </div>
        <div className="table-wrap">
          <table className="table-base"><tbody><TableSkeleton cols={6} rows={4} /></tbody></table>
        </div>
      </div>
    </div>
  );
  if (error || !customer)
    return <div className={`loading-center ${styles.errorCenter}`}>{error || "Customer not found."}</div>;

  const totalBilled = customer.invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid   = customer.invoices.reduce((s, i) => s + i.paidAmount, 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[{ label: "Customers", href: "/sales/customers" }, { label: customer.name }]} />

      {/* Header */}
      <div className={`card ${styles.headerCard}`}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.avatar}>{customer.name[0]?.toUpperCase()}</div>
            <div>
              <h1 className="page-title">{customer.name}</h1>
              <div className={styles.contactRow}>
                {customer.phone && <span className={styles.contactItem}>{customer.phone}</span>}
                {customer.email && <span className={styles.contactItem}>{customer.email}</span>}
                {customer.city  && <span className={styles.contactItem}>{[customer.city, customer.state].filter(Boolean).join(", ")}</span>}
              </div>
              {customer.gstin && (
                <code className={styles.gstinCode}>
                  GSTIN: {customer.gstin}
                </code>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" href={`/sales/customers/edit/${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
            <Button variant="primary" href={`/sales/invoices/new?customerId=${id}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
          </div>
        </div>
        {customer.address && (
          <div className={styles.addressBlock}>
            <div className={styles.addressLabel}>Address</div>
            <p className={styles.addressText}>
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
          { label: "Total Billed", value: `₹${totalBilled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, sub: `${customer.invoices.length} invoice(s)`, tone: "" as "" | "positive" | "negative" },
          { label: "Total Paid",   value: `₹${totalPaid.toLocaleString("en-IN",   { minimumFractionDigits: 2 })}`, tone: "positive" as "" | "positive" | "negative" },
          { label: "Outstanding",  value: `₹${outstanding.toLocaleString("en-IN",  { minimumFractionDigits: 2 })}`, tone: (outstanding > 0 ? "negative" : "positive") as "" | "positive" | "negative" },
        ].map((s) => (
          <div key={s.label} className={`card ${styles.cardPadSm}`}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={`${styles.statValue} ${s.tone === "positive" ? styles.positive : s.tone === "negative" ? styles.negative : ""}`}>{s.value}</div>
            {s.sub && <div className={styles.statSub}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Invoice history */}
      <div className="card">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Invoice History</h2>
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
                <tr><td colSpan={6} className={styles.emptyCell}>No invoices yet.</td></tr>
              ) : customer.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td data-mobile-full>
                    <Link href={`/sales/invoices/${inv.id}`} className={styles.invoiceLink}>
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td data-label="Date" className={styles.dateCellText}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className={`date-sub ${styles.dateSubRow}`}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </td>
                  <td data-label="Total" className={`table-td-right ${styles.totalCell}`}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-mobile-hide className={`table-td-right ${styles.paidCell}`}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Balance" className={`table-td-right ${styles.balanceCell}`}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
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
