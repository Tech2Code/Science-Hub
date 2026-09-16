"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { PeriodFilter, defaultPeriod, periodLabel, periodToQuery, type PeriodValue } from "@/components/dashboard/PeriodFilter";
import { StatusBadge } from "@/components/ui/Badge";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import styles from "./dashboardHome.module.css";

interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface FinancialFigures {
  // Cash Flow section — simple totals, deliberately not netted against each other.
  totalSales: number;
  gstSales: number;      // GST portion already included within totalSales
  totalPurchases: number;
  gstPurchases: number;  // GST portion already included within totalPurchases
}
interface FinancialMonth extends FinancialFigures { month: string; future: boolean; }
interface DashboardFinancials {
  fyLabel: string;
  canSeeSales: boolean;
  canSeePurchases: boolean;
  total: FinancialFigures;
  monthly: FinancialMonth[];
}
interface CombinedDashboard {
  // Null when the user lacks the matching section grant — server-redacted, not client-hidden.
  sales: {
    revenueThisMonth: number;
    outstandingAmount: number;
    overdueInvoices: number;
    collectedToday: number;
    recentInvoices: RecentInvoice[];
  } | null;
  purchases: {
    spendThisMonth: number;
    payableBalance: number;
    overdueBills: number;
    paidToday: number;
    recentBills: RecentBill[];
  } | null;
  lowStockCount: number;
  outOfStockCount: number;
  financials?: DashboardFinancials | null;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Tiny inline "i" affordance — uses the native title tooltip (no extra deps) plus an accessible label.
function InfoDot({ text }: { text: string }) {
  return (
    <span className={styles.infoDot} title={text} role="img" aria-label={text} tabIndex={0}>i</span>
  );
}

type FinTone = "neutral" | "blue" | "amber" | "green" | "red";
// One compact financial tile: label + info tooltip, prominent value, small helper line.
function FinTile({ label, value, help, info, tone = "neutral", loading }: {
  label: string; value: string; help: string; info: string; tone?: FinTone; loading?: boolean;
}) {
  return (
    <div className={`${styles.finTile} ${styles[`finTone_${tone}`]}`}>
      <div className={styles.finTileLabelRow}>
        <span className={styles.finTileLabel}>{label}</span>
        <InfoDot text={info} />
      </div>
      {loading
        ? <div className={`${styles.kpiCardSkeleton} ${styles.skeletonPulse}`} />
        : <div className={styles.finTileValue}>{value}</div>}
      <div className={styles.finTileHelp}>{help}</div>
    </div>
  );
}

type Tone = "blue" | "amber" | "red" | "green" | "neutral";

export default function DashboardPage() {
  // Financial Summary period: a financial year + (whole year | a month). Default = current FY, full year.
  const [finPeriod, setFinPeriod] = useState<PeriodValue>(defaultPeriod());
  // Fetch is scoped to the chosen FY (so a past FY refetches). Month drill-down within the loaded FY
  // is done client-side from financials.monthly, so switching months is instant with no refetch.
  const { data, loading, error } = useFetch<CombinedDashboard>(`/api/reports?type=combined-dashboard&fy=${finPeriod.fyStartYear}`);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const sections = session?.user?.sections ?? [];
  const canSeeSales = role === "admin" || sections.includes("sales_overview");
  const canSeePurchases = role === "admin" || sections.includes("purchase_overview");

  const firstName = session?.user?.name?.split(/[\s-]/)[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const canWrite = role !== "manager";

  const financials = data?.financials ?? null;
  const EMPTY_FIN: FinancialFigures = { totalSales: 0, gstSales: 0, totalPurchases: 0, gstPurchases: 0 };
  // periodLabel() builds the same en-IN/IST short month label ("Sep 2026") the server uses for
  // financials.monthly[].month, so a chosen month matches its row exactly. "Full year" → FY total.
  const finPeriodLabel = periodLabel(finPeriod);
  const finMonth = finPeriod.month0 === "all"
    ? null
    : financials?.monthly.find((m) => m.month === finPeriodLabel) ?? null;
  const finSelected: FinancialFigures =
    financials == null ? EMPTY_FIN
    : finPeriod.month0 === "all" ? financials.total
    : finMonth ?? EMPTY_FIN;   // a month with no data shows zeros, not the FY total
  const cashFlowNet = finSelected.totalSales - finSelected.totalPurchases;

  // The real Net GST Payable — same figure and same computation (buildGstFilingReport) as the GST
  // Filing report's own "Net GST Payable (Rounded)", not a client-side approximation, so the two
  // can never disagree. Gated the same way GST Filing itself is (admin, or both Sales Reports AND
  // Purchase Reports access) — stricter than the rest of this Cash Flow section, since this is the
  // real tax-liability figure, not a simple total. `null` skips the fetch entirely for a user who
  // clearly lacks access, instead of firing a request that will only 403.
  const canSeeGstPayable = role === "admin" || (sections.includes("reports_sales") && sections.includes("reports_purchases"));
  const { data: gstPayableData, loading: gstPayableLoading } = useFetch<{ netGstPayable: number }>(
    canSeeGstPayable ? `/api/reports?type=net-gst-payable&${periodToQuery(finPeriod)}` : null
  );

  const quickActionSections = [
    {
      key: "sales",
      label: "Sales", tone: "blue" as Tone, color: "var(--c-blue)", borderColor: "var(--c-blue)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>,
      tileSub: canWrite ? "Bill a customer" : "View invoices",
      actions: [
        ...(canWrite ? [{ label: "+ New Invoice", href: "/sales/invoices/new", primary: true }] : []),
        ...(canWrite ? [{ label: "+ New Customer", href: "/sales/customers/new", primary: false }] : []),
        { label: "All Invoices",    href: "/sales/invoices",      primary: !canWrite },
        { label: "All Customers",   href: "/sales/customers",     primary: false },
      ],
    },
    {
      key: "purchases",
      label: "Purchases", tone: "amber" as Tone, color: "#d97706", borderColor: "var(--c-amber)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
      tileSub: canWrite ? "Record a purchase" : "View purchases",
      actions: [
        ...(canWrite ? [{ label: "+ New Bill", href: "/purchases/bills/new", primary: true }] : []),
        ...(canWrite ? [{ label: "+ New Vendor", href: "/purchases/vendors/new", primary: false }] : []),
        { label: "All Bills",      href: "/purchases/bills",       primary: !canWrite },
        { label: "All Vendors",    href: "/purchases/vendors",     primary: false },
      ],
    },
    {
      key: "catalog",
      label: "Catalog", tone: "neutral" as Tone, color: "#64748b", borderColor: "var(--c-border-md)",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
      tileIcon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>,
      tileSub: canWrite ? "Add to inventory" : "View catalog",
      actions: [
        ...(canWrite ? [{ label: "+ New Product", href: "/products/new", primary: true }] : []),
        { label: "All Products",   href: "/products",        primary: !canWrite },
        { label: "Brands",         href: "/brands",          primary: false },
        { label: "Categories",     href: "/categories",      primary: false },
        ...(role === "admin" || sections.includes("reports_sales") ? [{ label: "Sales Reports", href: "/reports/sales", primary: false }] : []),
        ...(role === "admin" || sections.includes("reports_purchases") ? [{ label: "Buy Reports", href: "/reports/purchases", primary: false }] : []),
      ],
    },
  ];

  const visibleQuickActions = quickActionSections;

  return (
    <div className="page-stack">
      {/* ── Hero welcome banner ── */}
      <div {...animateSection(0, styles.hero)}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow} suppressHydrationWarning>
            {greeting}{firstName ? `, ${firstName}` : ""} <span aria-hidden="true">👋</span>
          </p>
          <h1 className={styles.heroTitle}>Here&apos;s your business at a glance</h1>
          <p className={styles.heroSub} suppressHydrationWarning>
            {/* Mirrors the Financial Summary period selector (FY + month). */}
            {finPeriodLabel} overview
          </p>
        </div>
      </div>

      {error && !loading && (
        <div className="error-banner">
          Couldn&apos;t load dashboard data. The figures below may be missing or stale — try refreshing the page.
        </div>
      )}

      {/* ── Primary action tiles ── */}
      <div {...animateSection(1, styles.actionTilesGrid)}>
        {visibleQuickActions.map(section => (
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
      <div {...animateSection(2, `card ${styles.quickActionsCard}`)}>
        {visibleQuickActions.map((section, sIdx) => (
          <div
            key={section.key}
            className={`${styles.quickActionSection} ${sIdx === visibleQuickActions.length - 1 ? styles.quickActionSectionLast : ""}`}
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

      {/* ── Cash Flow: total money in vs total money out, simple totals (not profit) ── */}
      {(canSeeSales || canSeePurchases) && (
      <div {...animateSection(3, `card ${styles.financialsCard}`)}>
        <div className={styles.financialsHeader}>
          <div>
            <h2 className={styles.cardHeaderTitle}>Cash Flow</h2>
            <div className={styles.financialsSub}>
              {loading ? "—" : (finPeriod.month0 === "all" ? "Full year" : "Month")}
              {" · "}{finPeriodLabel}
            </div>
          </div>
          <PeriodFilter value={finPeriod} onChange={setFinPeriod} disabled={loading} className={styles.financialsSelectWrap} />
        </div>

        <div className={styles.finTileGrid}>
          {canSeeSales && (
            <FinTile
              label="Total Sales" tone="blue" loading={loading}
              value={fmt(finSelected.totalSales)}
              help={`Incl. ${fmt(finSelected.gstSales)} GST`}
              info="Total invoice value including GST — the simple total billed, with nothing netted out."
            />
          )}
          {canSeeSales && (
            <FinTile
              label="GST Collected" tone="neutral" loading={loading}
              value={fmt(finSelected.gstSales)}
              help="Within Total Sales"
              info="The GST portion already included in Total Sales (CGST+SGST or IGST, plus GST on any transport charge)."
            />
          )}
          {canSeePurchases && (
            <FinTile
              label="Total Purchases" tone="amber" loading={loading}
              value={fmt(finSelected.totalPurchases)}
              help={`Incl. ${fmt(finSelected.gstPurchases)} GST`}
              info="Total purchase bill value including GST — everything bought in the period, whether or not it has sold yet."
            />
          )}
          {canSeePurchases && (
            <FinTile
              label="GST Paid (ITC)" tone="neutral" loading={loading}
              value={fmt(finSelected.gstPurchases)}
              help="Within Total Purchases"
              info="The GST portion already included in Total Purchases — this is reclaimable input tax credit, not a real cost. For the actual net amount payable to the government, see the GST Filing report."
            />
          )}
          {canSeeSales && canSeePurchases && (
            <FinTile
              label="Net (Sales − Purchases)" tone={cashFlowNet < 0 ? "red" : "neutral"} loading={loading}
              value={fmt(cashFlowNet)}
              help="Not profit — see note below"
              info="Total Sales minus Total Purchases. This is a simple cash comparison, not profit — see the note below."
            />
          )}
          {canSeeSales && canSeePurchases && canSeeGstPayable && (
            <FinTile
              label="Net GST Payable"
              // Positive = owed to the government (needs attention); negative = excess input
              // credit, i.e. nothing due this period (a comfortable position) — same red/green
              // convention as the other tiles above, just flipped since a negative number here is
              // the good outcome, not a bad one.
              tone={
                !gstPayableData ? "neutral"
                : gstPayableData.netGstPayable > 0 ? "red"
                : gstPayableData.netGstPayable < 0 ? "green"
                : "neutral"
              }
              loading={gstPayableLoading}
              value={gstPayableData ? fmt(gstPayableData.netGstPayable) : "—"}
              help={
                !gstPayableData ? "Same figure as GST Filing"
                : gstPayableData.netGstPayable > 0 ? "Owed to the government"
                : gstPayableData.netGstPayable < 0 ? "Excess input credit — nothing due"
                : "Nothing due this period"
              }
              info="The actual net GST payable for this period — output tax minus credit notes minus input tax credit, rounded. This is the exact same figure (and computation) as the GST Filing report's own Net GST Payable (Rounded), not an approximation. A negative value means excess input tax credit — nothing owed, and green rather than red since that's the favorable outcome."
            />
          )}
        </div>

        <div className={styles.financialsNote}>
          This is a simple cash comparison — total billed vs total spent — not profit. A bulk purchase of stock that hasn&apos;t sold yet will show up here as a big spend with nothing to offset it; that&apos;s expected for a cash-flow view. &quot;GST Collected&quot; and &quot;GST Paid (ITC)&quot; above are just the portion included in each total, not netted against each other — see &quot;Net GST Payable&quot; for the real amount owed (only shown with Sales Reports + Purchase Reports access, since it&apos;s the same figure as the GST Filing report).
        </div>
      </div>
      )}

      {/* Recent invoices & bills */}
      <div {...animateSection(4, styles.recentGrid)}>
        <div className="card">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardHeaderTitle}>Recent Invoices</h2>
            <Link href="/sales/invoices" className={styles.viewAllLink}>View all <ArrowIcon /></Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead><tr><th>Invoice</th><th>Customer</th><th className={styles.textRight}>Total</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={4}><div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} /></td></tr>
                )) : (data?.sales?.recentInvoices ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="table-empty-cell">No invoices yet. <Link href="/sales/invoices/new" className={styles.emptyLink}>Create one <ArrowIcon /></Link></td></tr>
                ) : (data?.sales?.recentInvoices ?? []).map((inv) => (
                  <tr key={inv.id}>
                    <td data-mobile-full><Link href={`/sales/invoices/${inv.id}`} className={styles.linkCell}>{inv.invoiceNumber}</Link></td>
                    <td data-label="Customer" className={styles.customerCell}>{inv.customerName}</td>
                    <td data-label="Total" className={styles.totalCell}>₹{inv.total.toLocaleString("en-IN")}</td>
                    <td data-label="Status"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardHeaderTitle}>Recent Purchase Bills</h2>
            <Link href="/purchases/bills" className={styles.viewAllLink}>View all <ArrowIcon /></Link>
          </div>
          <div className={styles.tableScroll}>
            <table className="table-base">
              <thead><tr><th>Bill</th><th>Vendor</th><th className={styles.textRight}>Total</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={4}><div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} /></td></tr>
                )) : (data?.purchases?.recentBills ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="table-empty-cell">No bills yet. <Link href="/purchases/bills/new" className={styles.emptyLink}>Create one <ArrowIcon /></Link></td></tr>
                ) : (data?.purchases?.recentBills ?? []).map((b) => (
                  <tr key={b.id}>
                    <td data-mobile-full><Link href={`/purchases/bills/${b.id}`} className={styles.linkCell}>{b.billNumber}</Link></td>
                    <td data-label="Vendor" className={styles.customerCell}>{b.vendorName}</td>
                    <td data-label="Total" className={styles.totalCell}>₹{b.total.toLocaleString("en-IN")}</td>
                    <td data-label="Status"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Low stock / out of stock alert */}
      {loading ? (
        <div className={`card ${styles.lowStockCard}`}>
          <div className={`${styles.lowStockIconWrap} ${styles.lowStockCardSkeleton} ${styles.skeletonPulse}`} />
          <div className={styles.lowStockBody}>
            <div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} style={{ width: "70%" }} />
            <div className={`${styles.rowSkeleton} ${styles.skeletonPulse}`} style={{ width: "45%" }} />
          </div>
        </div>
      ) : ((data?.lowStockCount ?? 0) > 0 || (data?.outOfStockCount ?? 0) > 0) && (
        <div {...animateSection(5, `card ${styles.lowStockCard}`)}>
          <div className={styles.lowStockIconWrap}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div className={styles.lowStockBody}>
            {(data?.lowStockCount ?? 0) > 0 && (
              <div className={styles.lowStockRow}>
                <div>
                  <div className={styles.lowStockTitle}>
                    {data?.lowStockCount} product{(data?.lowStockCount ?? 0) > 1 ? "s" : ""} running low on stock
                  </div>
                  <div className={styles.lowStockSub}>Review and restock to avoid stockouts</div>
                </div>
                <Button variant="secondary" size="sm" href="/products?filter=low">View Products <ArrowIcon /></Button>
              </div>
            )}
            {(data?.outOfStockCount ?? 0) > 0 && (
              <div className={styles.lowStockRow}>
                <div>
                  <div className={styles.lowStockTitle}>
                    {data?.outOfStockCount} product{(data?.outOfStockCount ?? 0) > 1 ? "s" : ""} out of stock
                  </div>
                  <div className={styles.lowStockSub}>Restock as soon as possible</div>
                </div>
                <Button variant="secondary" size="sm" href="/products?filter=out">View Products <ArrowIcon /></Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
