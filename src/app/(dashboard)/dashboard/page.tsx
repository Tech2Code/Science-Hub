"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { useFetch } from "@/lib/useCache";
import styles from "./dashboardHome.module.css";

interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface CombinedDashboard {
  sales: {
    revenueThisMonth: number;
    outstandingAmount: number;
    overdueInvoices: number;
    collectedToday: number;
    recentInvoices: RecentInvoice[];
  };
  purchases: {
    spendThisMonth: number;
    payableBalance: number;
    overdueBills: number;
    paidToday: number;
    recentBills: RecentBill[];
  };
  lowStockCount: number;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function SectionLabel({ children }: { children: string }) {
  return (
    <div className={styles.sectionLabel}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, color = "var(--c-text)", loading }: { label: string; value: string; color?: string; loading?: boolean }) {
  return (
    <div className={`card ${styles.kpiCard}`}>
      <div className={styles.kpiLabel}>{label}</div>
      {loading
        ? <div className={`${styles.kpiCardSkeleton} ${styles.skeletonPulse}`} />
        : <div className={styles.kpiValue} style={{ "--kpi-color": color } as React.CSSProperties}>{value}</div>
      }
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading } = useFetch<CombinedDashboard>("/api/reports?type=combined-dashboard");

  const quickActionSections = [
    {
      key: "sales",
      label: "Sales", color: "#2563eb", borderColor: "var(--c-blue)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
      actions: [
        { label: "+ New Invoice",   href: "/sales/invoices/new",  primary: true  },
        { label: "+ New Customer",  href: "/sales/customers/new", primary: false },
        { label: "All Invoices",    href: "/sales/invoices",      primary: false },
        { label: "All Customers",   href: "/sales/customers",     primary: false },
      ],
    },
    {
      key: "purchases",
      label: "Purchases", color: "#d97706", borderColor: "var(--c-amber)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      actions: [
        { label: "+ New Bill",     href: "/purchases/bills/new",   primary: true  },
        { label: "+ New Vendor",   href: "/purchases/vendors/new", primary: false },
        { label: "All Bills",      href: "/purchases/bills",       primary: false },
        { label: "All Vendors",    href: "/purchases/vendors",     primary: false },
      ],
    },
    {
      key: "catalog",
      label: "Catalog", color: "#64748b", borderColor: "var(--c-border-md)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
      actions: [
        { label: "+ New Product",  href: "/products/new",    primary: true  },
        { label: "All Products",   href: "/products",        primary: false },
        { label: "Sales Reports",  href: "/reports/sales",   primary: false },
        { label: "Buy Reports",    href: "/reports/purchases",primary: false },
      ],
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub" suppressHydrationWarning>
            {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })} overview
          </p>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className={`card ${styles.quickActionsCard}`}>
        <div className={styles.quickActionsHeader}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span className={styles.quickActionsHeaderLabel}>Quick Actions</span>
        </div>

        {/* SALES row */}
        {quickActionSections.map((section, sIdx) => (
          <div
            key={section.key}
            className={`${styles.quickActionSection} ${sIdx === quickActionSections.length - 1 ? styles.quickActionSectionLast : ""}`}
            style={{ "--accent": section.color, "--accent-border": section.borderColor } as React.CSSProperties}
          >
            {/* Section label — fixed width column */}
            <div className={styles.quickActionSectionLabel}>
              <span className={styles.quickActionSectionDot} />
              {section.icon}
              <span className={styles.quickActionSectionLabelText}>
                {section.label}
              </span>
            </div>
            {/* Action chips */}
            <div className={styles.actionChips}>
              {section.actions.map(a => (
                <Link
                  key={a.href} href={a.href}
                  className={`${styles.actionChip} ${a.primary ? styles.actionChipPrimary : ""}`}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sales & Purchases side-by-side */}
      <div className={styles.sideBySideGrid}>
        {/* SALES half */}
        <div className={styles.sideBySideCol}>
          <SectionLabel>Sales</SectionLabel>
          <div className={styles.kpiGrid}>
            <KpiCard label="Revenue This Month" value={loading ? "—" : fmt(data?.sales.revenueThisMonth ?? 0)} color="var(--c-blue)" loading={loading} />
            <KpiCard label="Outstanding" value={loading ? "—" : fmt(data?.sales.outstandingAmount ?? 0)} color="var(--c-amber)" loading={loading} />
            <KpiCard label="Overdue Invoices" value={loading ? "—" : String(data?.sales.overdueInvoices ?? 0)} color={(data?.sales.overdueInvoices ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
            <KpiCard label="Collected Today" value={loading ? "—" : fmt(data?.sales.collectedToday ?? 0)} color="var(--c-green-text)" loading={loading} />
          </div>
        </div>
        {/* PURCHASES half */}
        <div className={styles.sideBySideCol}>
          <SectionLabel>Purchases</SectionLabel>
          <div className={styles.kpiGrid}>
            <KpiCard label="Spend This Month" value={loading ? "—" : fmt(data?.purchases.spendThisMonth ?? 0)} color="var(--c-amber)" loading={loading} />
            <KpiCard label="Payable Balance" value={loading ? "—" : fmt(data?.purchases.payableBalance ?? 0)} color="var(--c-amber)" loading={loading} />
            <KpiCard label="Overdue Bills" value={loading ? "—" : String(data?.purchases.overdueBills ?? 0)} color={(data?.purchases.overdueBills ?? 0) > 0 ? "var(--c-red)" : "var(--c-text-4)"} loading={loading} />
            <KpiCard label="Paid Today" value={loading ? "—" : fmt(data?.purchases.paidToday ?? 0)} color="var(--c-green-text)" loading={loading} />
          </div>
        </div>
      </div>

      {/* Recent invoices & bills */}
      <div className={styles.recentGrid}>
        <div className="card">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardHeaderTitle}>Recent Invoices</h2>
            <Link href="/sales/invoices" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead><tr><th>Invoice</th><th>Customer</th><th className={styles.textRight}>Total</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={4}><div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} /></td></tr>
                )) : (data?.sales.recentInvoices ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="table-empty-cell">No invoices yet. <Link href="/sales/invoices/new" className={styles.emptyLink}>Create one →</Link></td></tr>
                ) : (data?.sales.recentInvoices ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td><Link href={`/sales/invoices/${inv.id}`} className={styles.linkCell}>{inv.invoiceNumber}</Link></td>
                    <td className={styles.customerCell}>{inv.customerName}</td>
                    <td className={styles.totalCell}>₹{inv.total.toLocaleString("en-IN")}</td>
                    <td><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardHeaderTitle}>Recent Purchase Bills</h2>
            <Link href="/purchases/bills" className={styles.viewAllLink}>View all →</Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead><tr><th>Bill</th><th>Vendor</th><th className={styles.textRight}>Total</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={4}><div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} /></td></tr>
                )) : (data?.purchases.recentBills ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="table-empty-cell">No bills yet. <Link href="/purchases/bills/new" className={styles.emptyLink}>Create one →</Link></td></tr>
                ) : (data?.purchases.recentBills ?? []).map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/purchases/bills/${b.id}`} className={styles.linkCell}>{b.billNumber}</Link></td>
                    <td className={styles.customerCell}>{b.vendorName}</td>
                    <td className={styles.totalCell}>₹{b.total.toLocaleString("en-IN")}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Low stock alert */}
      {!loading && (data?.lowStockCount ?? 0) > 0 && (
        <div className={`card ${styles.lowStockCard}`}>
          <div className={styles.lowStockIconWrap}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div className={styles.lowStockBody}>
            <div className={styles.lowStockTitle}>
              {data?.lowStockCount} product{(data?.lowStockCount ?? 0) > 1 ? "s" : ""} running low on stock
            </div>
            <div className={styles.lowStockSub}>Review and restock to avoid stockouts</div>
          </div>
          <Button variant="secondary" size="sm" href="/products">View Products →</Button>
        </div>
      )}
    </div>
  );
}
