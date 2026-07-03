"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";
import styles from "./purchasesOverview.module.css";

interface MonthlyBar { month: string; total: number; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface TopVendor { id: string; name: string; totalBilled: number; totalPaid: number; }
interface PurchaseDashboard {
  spendThisMonth: number;
  totalPaid: number;
  payableBalance: number;
  overdueBillsCount: number;
  monthlySpend: MonthlyBar[];
  fyLabel?: string;
  recentBills: RecentBill[];
  topVendors: TopVendor[];
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

export default function PurchaseDashboardPage() {
  const { data, loading } = useFetch<PurchaseDashboard>("/api/reports?type=purchase-dashboard");

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Overview</h1>
          <p className="page-sub" suppressHydrationWarning>
            {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Quick actions — on top */}
      <div className={`card ${styles.sectionCard}`}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.quickActions}>
          <Button variant="primary" href="/purchases/bills/new">+ New Bill</Button>
          <Button variant="secondary" href="/purchases/vendors/new">+ New Vendor</Button>
          <Button variant="secondary" href="/purchases/bills">All Bills</Button>
          <Button variant="secondary" href="/purchases/vendors">All Vendors</Button>
          <Button variant="secondary" href="/reports/purchases">Purchase Reports</Button>
        </div>
      </div>

      {/* KPI row */}
      <div className={styles.kpiRow}>
        <KpiCard label="Spend This Month" value={loading ? "—" : fmt(data?.spendThisMonth ?? 0)} sub="total billed" loading={loading} color="var(--c-amber)" />
        <KpiCard label="Total Paid" value={loading ? "—" : fmt(data?.totalPaid ?? 0)} sub="all time" loading={loading} color="var(--c-green-text)" />
        <KpiCard label="Payable Balance" value={loading ? "—" : fmt(data?.payableBalance ?? 0)} sub="pending payment" loading={loading} color="var(--c-amber)" />
        <KpiCard label="Overdue Bills" value={loading ? "—" : String(data?.overdueBillsCount ?? 0)} sub="past due date" loading={loading} color={(data?.overdueBillsCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} />
      </div>

      {/* Monthly bar chart */}
      <div className={`card ${styles.chartCard}`}>
        <h2 className={styles.chartCardTitle}>Monthly Spend — {data?.fyLabel ?? "Current FY"}</h2>
        {loading || !data?.monthlySpend?.length
          ? <div className={styles.chartSkeleton} />
          : <BarChart data={data.monthlySpend} />
        }
      </div>

      {/* Recent bills + Top vendors */}
      <div className={styles.twoColGrid}>
        <div className="card">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Bills</h2>
            <Link href="/purchases/bills" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Vendor</th>
                  <th className={styles.textRight}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={4}><div className={styles.rowSkeleton} /></td></tr>
                  ))
                ) : (data?.recentBills ?? []).length === 0 ? (
                  <tr><td colSpan={4} className={styles.emptyCell}>No bills yet.</td></tr>
                ) : (data?.recentBills ?? []).map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/purchases/bills/${b.id}`} className={styles.billLink}>{b.billNumber}</Link></td>
                    <td className={styles.vendorNameCell}>{b.vendorName}</td>
                    <td className={styles.amountCell}>₹{b.total.toLocaleString("en-IN")}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Top 5 Vendors</h2>
            <Link href="/purchases/vendors" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className={styles.textRight}>Total</th>
                  <th className={styles.textRight}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}><td colSpan={3}><div className={styles.rowSkeleton} /></td></tr>
                  ))
                ) : (data?.topVendors ?? []).length === 0 ? (
                  <tr><td colSpan={3} className={styles.emptyCell}>No vendors yet.</td></tr>
                ) : (data?.topVendors ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className={styles.vendorLink}>{v.name}</td>
                    <td className={styles.amountCell}>₹{v.totalBilled.toLocaleString("en-IN")}</td>
                    <td
                      className={styles.balanceCell}
                      style={{ "--balance-color": (v.totalBilled - v.totalPaid) > 0 ? "var(--c-amber)" : "var(--c-green-text)" } as React.CSSProperties}
                    >
                      ₹{(v.totalBilled - v.totalPaid).toLocaleString("en-IN")}
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
