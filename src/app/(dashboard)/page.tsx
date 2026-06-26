"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";
import styles from "./page.module.css";

interface Summary {
  invoicesThisMonth: number;
  revenueThisMonth: number;
  outstandingAmount: number;
  lowStockCount: number;
  recentInvoices: RecentInvoice[];
}
interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  customerName: string;
  total: number;
  paidAmount: number;
  balance: number;
  status: string;
}

const cards = [
  { key: "invoicesThisMonth", label: "Invoices This Month", icon: "◫", gradient: "linear-gradient(135deg,#3b82f6,#2563eb)", glow: "#3b82f6", format: (v: number) => String(v), sub: "invoices created", href: "/invoices" },
  { key: "revenueThisMonth",  label: "Revenue This Month",  icon: "◎", gradient: "linear-gradient(135deg,#14b8a6,#10b981)", glow: "#14b8a6", format: (v: number) => `₹${v.toLocaleString("en-IN")}`, sub: "total billed", href: "/invoices" },
  { key: "outstandingAmount", label: "Outstanding",         icon: "◑", gradient: "linear-gradient(135deg,#f59e0b,#f97316)", glow: "#f59e0b", format: (v: number) => `₹${v.toLocaleString("en-IN")}`, sub: "pending collection", href: "/reports" },
  { key: "lowStockCount",     label: "Low Stock Alerts",    icon: "⬖", gradient: "linear-gradient(135deg,#ef4444,#e11d48)", glow: "#ef4444", format: (v: number) => String(v), sub: "products need restock", href: "/reports" },
];

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      const t = setTimeout(() => setValue(0), 0);
      return () => clearTimeout(t);
    }
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

export default function DashboardPage() {
  const { data, loading } = useFetch<Summary>("/api/reports?type=summary");

  const inv   = useCountUp(data?.invoicesThisMonth ?? 0);
  const rev   = useCountUp(data?.revenueThisMonth ?? 0);
  const out   = useCountUp(data?.outstandingAmount ?? 0);
  const stock = useCountUp(data?.lowStockCount ?? 0);
  const animated = [inv, rev, out, stock];
  const month = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{month} overview</p>
        </div>
        <Button variant="primary" href="/invoices/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
      </div>

      {/* Stat cards */}
      <div className={styles.statsGrid}>
        {cards.map((card, i) => (
          <Link key={card.key} href={card.href} className={`${styles.statCard} animate-card animate-card-${i + 1}`}>
            <div className={styles.statBlob} style={{ background: card.glow }} />
            <div className={styles.statIconWrap} style={{ background: card.gradient }}>
              {card.icon}
            </div>
            {loading
              ? <div className={styles.statSkeleton} />
              : <div className={`${styles.statValue} animate-count`}>{card.format(animated[i])}</div>
            }
            <div className={styles.statLabel}>{card.label}</div>
            <div className={styles.statSub}>{card.sub}</div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className={styles.quickGrid}>
        {[
          { href: "/invoices/new",  label: "New Invoice",   icon: "◫" },
          { href: "/customers/new", label: "Add Customer",  icon: "◈" },
          { href: "/products/new",  label: "Add Product",   icon: "⬖" },
          { href: "/reports",       label: "View Reports",  icon: "◑" },
        ].map((action) => (
          <Link key={action.href} href={action.href} className={styles.quickBtn}>
            <span className={styles.quickIcon}>{action.icon}</span>
            {action.label}
          </Link>
        ))}
      </div>

      {/* Recent invoices */}
      <div className={styles.recentCard}>
        <div className={styles.recentHeader}>
          <div>
            <h2 className={styles.recentTitle}>Recent Invoices</h2>
            <p className={styles.recentSub}>Latest 5 transactions</p>
          </div>
          <Link href="/invoices" className={styles.viewAllLink}>
            View all →
          </Link>
        </div>

        {loading ? (
          <div className={styles.skeletonRows}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={styles.skeletonRow} style={{ '--shimmer-delay': `${i * 80}ms` } as React.CSSProperties} />
            ))}
          </div>
        ) : (data?.recentInvoices ?? []).length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>◫</span>
            <p className={styles.emptyText}>No invoices yet</p>
            <Link href="/invoices/new" className={styles.emptyLink}>
              Create your first invoice →
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th className="table-th-right">Total</th>
                  <th className="table-th-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentInvoices ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td data-mobile-full>
                      <Link href={`/invoices/${inv.id}`} className={styles.invNum}>
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td data-mobile-hide className={styles.invDate}>
                      <div>{new Date(inv.date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}</div>
                      <div className="date-sub" style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                        {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </td>
                    <td data-label="Customer" className={styles.invCust}>{inv.customerName}</td>
                    <td data-label="Total" className={`table-td-right ${styles.invAmt}`}>₹{inv.total.toLocaleString("en-IN")}</td>
                    <td data-label="Balance" className={`table-td-right ${styles.invBal}`}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN")}</td>
                    <td data-label="Status"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
