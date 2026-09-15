"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import { formatMonthYear } from "@/lib/formatDate";
import { PeriodFilter, defaultPeriod, periodToQuery, periodLabel as fmtPeriodLabel, type PeriodValue } from "@/components/dashboard/PeriodFilter";
import styles from "./salesOverview.module.css";

interface MonthlyBar { month: string; total: number; }
interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface TopCustomer { id: string; name: string; totalBilled: number; totalPaid: number; }
interface SalesDashboard {
  periodLabel?: string;
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
        // Scaled to 84 (not 100) so the tallest bar itself leaves headroom for its value
        // label — clamping the output instead would flatten every near-max bar to the same
        // height and hide real differences between them (e.g. 20L vs 22L both reading as 84%).
        const pct = (bar.total / max) * 84;
        const isHov = hovered === idx;
        return (
          <div
            key={bar.month}
            className={styles.chartCol}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Bar — value label floats directly above its own bar's top, moving with bar height.
                Capped at 84% (not 100%) to leave headroom for that label: .chartScroll mixes
                overflow-x:auto with overflow-y:visible, but per spec a non-visible x-axis forces
                the y-axis to compute as auto too, so a label poking above a full-height bar would
                get clipped instead of floating freely. */}
            <div className={styles.chartBarWrap}>
              <div
                className={`${styles.chartBar} ${hovered !== null && !isHov ? styles.dimmed : ""}`}
                style={{ "--bar-pct": `${Math.max(pct, 2)}%` } as React.CSSProperties}
              >
                <div className={`${styles.chartValue} ${isHov ? styles.hovered : ""}`}>
                  {isHov ? fmt(bar.total) : shortFmt(bar.total)}
                </div>
              </div>
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
  const { data: session } = useSession();
  const router = useRouter();
  const canWrite = useCanWrite();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    if (!session.user?.sections?.includes("sales_overview")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  // Default = current FY, full year. Two dropdowns (FY + month) drive the KPIs.
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod());

  // Two fetches with distinct cache keys so the period selector only touches the KPI numbers:
  //  • base   → stable current-FY URL. Powers the monthly bar chart, Recent Invoices and Top
  //             Customers (a "this year / latest" view) so changing the KPI period never refetches
  //             or re-renders them.
  //  • scoped → changes with the FY+month selection; only its four KPI figures are read.
  const baseUrl = "/api/reports?type=sales-dashboard";
  const scopedUrl = `/api/reports?type=sales-dashboard&${periodToQuery(period)}`;
  const { data: base, loading: baseLoading } = useFetch<SalesDashboard>(baseUrl);
  const { data: scoped, loading: scopedLoading } = useFetch<SalesDashboard>(scopedUrl);
  const loading = baseLoading;                 // chart/lists skeletons follow the base fetch
  const kpiLoading = scopedLoading;            // KPI skeletons follow the period-scoped fetch
  const data = base;                           // chart + lists read the current-FY payload
  const periodLabel = scoped?.periodLabel ?? fmtPeriodLabel(period);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Overview</h1>
          <p className="page-sub" suppressHydrationWarning>
            {formatMonthYear()}
          </p>
        </div>
      </div>

      {/* Quick actions — on top */}
      <div {...animateSection(0, `card ${styles.sectionCard}`)}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.quickActions}>
          {canWrite && <Button variant="primary" href="/sales/invoices/new">+ New Invoice</Button>}
          {canWrite && <Button variant="secondary" href="/sales/customers/new">+ New Customer</Button>}
          <Button variant="secondary" href="/sales/invoices">All Invoices</Button>
          <Button variant="secondary" href="/sales/customers">All Customers</Button>
          <Button variant="secondary" href="/reports/sales">Sales Reports</Button>
        </div>
      </div>

      {/* KPI section — the period filter scopes only these four figures, so it lives here with them. */}
      <div {...animateSection(1, styles.kpiSection)}>
        <div className={styles.kpiSectionHead}>
          <h2 className={styles.sectionTitle}>Key figures</h2>
          <PeriodFilter value={period} onChange={setPeriod} disabled={kpiLoading} className={styles.periodSelectWrap} />
        </div>
        <div className={styles.kpiRow}>
          <KpiCard label="Revenue" value={kpiLoading ? "—" : fmt(scoped?.revenueThisMonth ?? 0)} sub={`total billed · ${periodLabel}`} loading={kpiLoading} color="var(--c-blue)" />
          <KpiCard label="Collected" value={kpiLoading ? "—" : fmt(scoped?.totalCollected ?? 0)} sub={`payments · ${periodLabel}`} loading={kpiLoading} color="var(--c-green-text)" />
          <KpiCard label="Outstanding Balance" value={kpiLoading ? "—" : fmt(scoped?.outstandingBalance ?? 0)} sub={`pending now · ${periodLabel}`} loading={kpiLoading} color="var(--c-amber)" />
          <KpiCard label="Overdue Invoices" value={kpiLoading ? "—" : String(scoped?.overdueCount ?? 0)} sub={`past due · ${periodLabel}`} loading={kpiLoading} color={(scoped?.overdueCount ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} />
        </div>
      </div>

      {/* Monthly bar chart */}
      <div {...animateSection(2, `card ${styles.chartCard}`)}>
        <h2 className={styles.chartCardTitle}>Monthly Revenue — {data?.fyLabel ?? "Current FY"}</h2>
        {loading || !data?.monthlyRevenue?.length
          ? <div className={styles.chartSkeleton} />
          : <BarChart data={data.monthlyRevenue} />
        }
      </div>

      {/* Recent invoices + Top customers */}
      <div {...animateSection(3, styles.twoColGrid)}>
        {/* Recent Invoices */}
        <div className="card">
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Invoices</h2>
            <Link href="/sales/invoices" className={styles.viewAllLink}>View all <ArrowIcon /></Link>
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
            <Link href="/sales/customers" className={styles.viewAllLink}>View all <ArrowIcon /></Link>
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
