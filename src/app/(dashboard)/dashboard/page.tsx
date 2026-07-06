"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
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

type Tone = "blue" | "amber" | "red" | "green" | "neutral";

const KPI_ICONS: Record<string, React.ReactNode> = {
  trendUp: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>,
  trendDown: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  alert: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  wallet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>,
};

function KpiCard({ icon, label, value, tone = "neutral", loading }: { icon: keyof typeof KPI_ICONS; label: string; value: string; tone?: Tone; loading?: boolean }) {
  return (
    <div className={`card ${styles.kpiCard}`} data-tone={tone}>
      <div className={styles.kpiIconWrap}>{KPI_ICONS[icon]}</div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiLabel}>{label}</div>
        {loading
          ? <div className={`${styles.kpiCardSkeleton} ${styles.skeletonPulse}`} />
          : <div className={styles.kpiValue}>{value}</div>
        }
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error } = useFetch<CombinedDashboard>("/api/reports?type=combined-dashboard");
  const { data: session } = useSession();

  const firstName = session?.user?.name?.split(/[\s-]/)[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const quickActionSections = [
    {
      key: "sales",
      label: "Sales", tone: "blue" as Tone, color: "#2563eb", borderColor: "var(--c-blue)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
      tileSub: "Bill a customer",
      actions: [
        { label: "+ New Invoice",   href: "/sales/invoices/new",  primary: true  },
        { label: "+ New Customer",  href: "/sales/customers/new", primary: false },
        { label: "All Invoices",    href: "/sales/invoices",      primary: false },
        { label: "All Customers",   href: "/sales/customers",     primary: false },
      ],
    },
    {
      key: "purchases",
      label: "Purchases", tone: "amber" as Tone, color: "#d97706", borderColor: "var(--c-amber)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      tileSub: "Record a purchase",
      actions: [
        { label: "+ New Bill",     href: "/purchases/bills/new",   primary: true  },
        { label: "+ New Vendor",   href: "/purchases/vendors/new", primary: false },
        { label: "All Bills",      href: "/purchases/bills",       primary: false },
        { label: "All Vendors",    href: "/purchases/vendors",     primary: false },
      ],
    },
    {
      key: "catalog",
      label: "Catalog", tone: "neutral" as Tone, color: "#64748b", borderColor: "var(--c-border-md)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
      tileSub: "Add to inventory",
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
      {/* ── Hero welcome banner ── */}
      <div className={`${styles.hero} animate-card animate-card-1`}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow} suppressHydrationWarning>
            {greeting}{firstName ? `, ${firstName}` : ""} <span aria-hidden="true">👋</span>
          </p>
          <h1 className={styles.heroTitle}>Here&apos;s your business at a glance</h1>
          <p className={styles.heroSub} suppressHydrationWarning>
            {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })} overview
          </p>
        </div>
      </div>

      {error && !loading && (
        <div className="error-banner">
          Couldn&apos;t load dashboard data. The figures below may be missing or stale — try refreshing the page.
        </div>
      )}

      {/* ── Primary action tiles ── */}
      <div className={`${styles.actionTilesGrid} animate-card animate-card-2`}>
        {quickActionSections.map(section => (
          <Link key={section.key} href={section.actions[0].href} className={styles.actionTile} data-tone={section.tone}>
            <span className={styles.actionTileIcon}>{section.tileIcon}</span>
            <span className={styles.actionTileText}>
              <span className={styles.actionTileLabel}>{section.actions[0].label.replace(/^\+\s*/, "")}</span>
              <span className={styles.actionTileSub}>{section.tileSub}</span>
            </span>
            <span className={styles.actionTileArrow} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </span>
          </Link>
        ))}
      </div>

      {/* ── Secondary quick links ── */}
      <div className={`card ${styles.quickActionsCard} animate-card animate-card-3`}>
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
            {/* Action chips (secondary links only — primary action lives in the tile above) */}
            <div className={styles.actionChips}>
              {section.actions.slice(1).map(a => (
                <Link key={a.href} href={a.href} className={styles.actionChip}>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sales & Purchases side-by-side */}
      <div className={`${styles.sideBySideGrid} animate-card animate-card-4`}>
        {/* SALES half */}
        <div className={styles.sideBySideCol}>
          <SectionLabel>Sales</SectionLabel>
          <div className={styles.kpiGrid}>
            <KpiCard icon="trendUp" label="Revenue This Month" value={loading ? "—" : fmt(data?.sales.revenueThisMonth ?? 0)} tone="blue" loading={loading} />
            <KpiCard icon="clock" label="Outstanding" value={loading ? "—" : fmt(data?.sales.outstandingAmount ?? 0)} tone="amber" loading={loading} />
            <KpiCard icon="alert" label="Overdue Invoices" value={loading ? "—" : String(data?.sales.overdueInvoices ?? 0)} tone={(data?.sales.overdueInvoices ?? 0) > 0 ? "red" : "neutral"} loading={loading} />
            <KpiCard icon="check" label="Collected Today" value={loading ? "—" : fmt(data?.sales.collectedToday ?? 0)} tone="green" loading={loading} />
          </div>
        </div>
        {/* PURCHASES half */}
        <div className={styles.sideBySideCol}>
          <SectionLabel>Purchases</SectionLabel>
          <div className={styles.kpiGrid}>
            <KpiCard icon="trendDown" label="Spend This Month" value={loading ? "—" : fmt(data?.purchases.spendThisMonth ?? 0)} tone="amber" loading={loading} />
            <KpiCard icon="wallet" label="Payable Balance" value={loading ? "—" : fmt(data?.purchases.payableBalance ?? 0)} tone="amber" loading={loading} />
            <KpiCard icon="alert" label="Overdue Bills" value={loading ? "—" : String(data?.purchases.overdueBills ?? 0)} tone={(data?.purchases.overdueBills ?? 0) > 0 ? "red" : "neutral"} loading={loading} />
            <KpiCard icon="check" label="Paid Today" value={loading ? "—" : fmt(data?.purchases.paidToday ?? 0)} tone="green" loading={loading} />
          </div>
        </div>
      </div>

      {/* Recent invoices & bills */}
      <div className={`${styles.recentGrid} animate-card animate-card-4`}>
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
