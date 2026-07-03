"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";
import styles from "./salesOverview.module.css";

interface MonthlyBar { month: string; total: number; }
interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface TopCustomer { id: string; name: string; totalBilled: number; totalPaid: number; }
interface SalesDashboard {
  revenueThisMonth: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueCount: number;
  monthlyRevenue: MonthlyBar[];
  fyLabel?: string;
  recentInvoices: RecentInvoice[];
  topCustomers: TopCustomer[];
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const shortFmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
};

function BarChart({ data }: { data: MonthlyBar[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className={styles.chartScroll}>
    <div className={styles.chart}>
      {data.map((bar, idx) => {
        const pct = (bar.total / max) * 100;
        const isHov = hovered === idx;
        return (
          <div
            key={bar.month}
            className={styles.chartCol}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Value label — always shows the short form; full value floats in a tooltip on hover */}
            <div className={styles.chartValue}>
              {shortFmt(bar.total)}
            </div>
            {/* Bar */}
            <div className={styles.chartBarWrap}>
              {isHov && <div className={styles.chartTooltip}>{fmt(bar.total)}</div>}
              <div
                className={`${styles.chartBar} ${hovered !== null && !isHov ? styles.dimmed : ""}`}
                style={{ "--bar-pct": `${Math.max(pct, 2)}%` } as React.CSSProperties}
              />
            </div>
            <div className={`${styles.chartLabel} ${isHov ? styles.hovered : ""}`}>
              {bar.month.split(" ")[0]}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color = "var(--c-text)", loading }: { label: string; value: string; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div className={`card ${styles.kpiCard}`}>
      <div className={styles.kpiLabel}>{label}</div>
      {loading
        ? <div className={styles.kpiSkeleton} />
        : <div className={styles.kpiValue} style={{ "--kpi-color": color } as React.CSSProperties}>{value}</div>
      }
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { data, loading } = useFetch<SalesDashboard>("/api/reports?type=sales-dashboard");

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Overview</h1>
          <p className="page-sub" suppressHydrationWarning>
            {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Quick actions — on top */}
      <div className={`card ${styles.sectionCard}`}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.quickActions}>
          <Button variant="primary" href="/sales/invoices/new">+ New Invoice</Button>
          <Button variant="secondary" href="/sales/customers/new">+ New Customer</Button>
          <Button variant="secondary" href="/sales/invoices">All Invoices</Button>
          <Button variant="secondary" href="/sales/customers">All Customers</Button>
          <Button variant="secondary" href="/reports/sales">Sales Reports</Button>
        </div>
      </div>

      {/* KPI row */}
      <div className={styles.kpiRow}>
        <KpiCard label="Revenue This Month" value={loading ? "—" : fmt(data?.revenueThisMonth ?? 0)} sub="total billed" loading={loading} color="var(--c-blue)" />
        <KpiCard label="Total Collected" value={loading ? "—" : fmt(data?.totalCollected ?? 0)} sub="all time" loading={loading} color="var(--c-green-text)" />
        <KpiCard label="Outstanding Balance" value={loading ? "—" : fmt(data?.outstandingBalance ?? 0)} sub="pending collection" loading={loading} color="var(--c-amber)" />
        <KpiCard label="Overdue Invoices" value={loading ? "—" : String(data?.overdueCount ?? 0)} sub="past due date" loading={loading} color={(data?.overdueCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} />
      </div>

      {/* Monthly bar chart */}
      <div className={`card ${styles.chartCard}`}>
        <h2 className={styles.chartCardTitle}>Monthly Revenue — {data?.fyLabel ?? "Current FY"}</h2>
        {loading || !data?.monthlyRevenue?.length
          ? <div className={styles.chartSkeleton} />
          : <BarChart data={data.monthlyRevenue} />
        }
      </div>

      {/* Recent invoices + Top customers */}
      <div className={styles.twoColGrid}>
        {/* Recent Invoices */}
        <div className="card">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Invoices</h2>
            <Link href="/sales/invoices" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className={styles.textRight}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={4}><div className={styles.rowSkeleton} /></td></tr>
                  ))
                ) : (data?.recentInvoices ?? []).length === 0 ? (
                  <tr><td colSpan={4} className={styles.emptyCell}>No invoices yet.</td></tr>
                ) : (data?.recentInvoices ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td><Link href={`/sales/invoices/${inv.id}`} className={styles.invoiceLink}>{inv.invoiceNumber}</Link></td>
                    <td className={styles.customerNameCell}>{inv.customerName}</td>
                    <td className={styles.amountCell}>₹{inv.total.toLocaleString("en-IN")}</td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Customers */}
        <div className="card">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Top 5 Customers</h2>
            <Link href="/sales/customers" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className={styles.textRight}>Billed</th>
                  <th className={styles.textRight}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={3}><div className={styles.rowSkeleton} /></td></tr>
                  ))
                ) : (data?.topCustomers ?? []).length === 0 ? (
                  <tr><td colSpan={3} className={styles.emptyCell}>No customers yet.</td></tr>
                ) : (data?.topCustomers ?? []).map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/sales/customers/${c.id}`} className={styles.customerLink}>{c.name}</Link></td>
                    <td className={styles.amountCell}>₹{c.totalBilled.toLocaleString("en-IN")}</td>
                    <td
                      className={styles.balanceCell}
                      style={{ "--balance-color": (c.totalBilled - c.totalPaid) > 0 ? "var(--c-amber)" : "var(--c-green-text)" } as React.CSSProperties}
                    >
                      ₹{(c.totalBilled - c.totalPaid).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
