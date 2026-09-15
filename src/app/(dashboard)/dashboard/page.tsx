"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { PeriodFilter, defaultPeriod, periodLabel, type PeriodValue } from "@/components/dashboard/PeriodFilter";
import { StatusBadge } from "@/components/ui/Badge";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import styles from "./dashboardHome.module.css";

interface RecentInvoice { id: string; invoiceNumber: string; date: string; customerName: string; total: number; paidAmount: number; status: string; }
interface RecentBill { id: string; billNumber: string; billDate: string; vendorName: string; total: number; paidAmount: number; status: string; }
interface FinancialFigures {
  // Actual Profit section — fully netted
  grossSales: number;            // sales incl. GST (incl. transport)
  gst: number;                   // output GST
  netSales: number;              // grossSales - gst
  returnNet: number;             // credit notes' own ex-GST value
  netSalesAfterReturns: number;  // netSales - returnNet
  cogs: number;                  // real cost of goods sold (WAC, from src/lib/inventoryCosting.ts) + sale transport charge at assumed 0% margin
  returnCogs: number;            // cost of the returned quantity
  netCogs: number;                // cogs - returnCogs
  otherExpenses: number;         // Purchase Bill's own transport/freight charge — not tied to any product's cost
  grossProfit: number;           // netSalesAfterReturns - netCogs - otherExpenses
  costedQty: number;    // qty sold with a real weighted-average cost
  estimatedQty: number; // qty sold using Product.purchasePrice as a placeholder (no purchase history yet)
  uncostedQty: number;  // qty sold with no product cost at all (legacy, never recomputed)
  // Cash Flow section — simple totals, deliberately not netted against each other
  totalSales: number;
  totalPurchases: number;
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
  // "How your profit is calculated" is a collapsible accordion under the Actual Profit tiles —
  // starts open since it was always-visible before this was made collapsible.
  const [profitBreakdownOpen, setProfitBreakdownOpen] = useState(true);
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
  const EMPTY_FIN: FinancialFigures = {
    grossSales: 0, gst: 0, netSales: 0, returnNet: 0, netSalesAfterReturns: 0,
    cogs: 0, returnCogs: 0, netCogs: 0, otherExpenses: 0, grossProfit: 0,
    costedQty: 0, estimatedQty: 0, uncostedQty: 0,
    totalSales: 0, totalPurchases: 0,
  };
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
  // Gross Profit Margin = (Gross Profit / Net Sales After Returns) × 100. Guard divide-by-zero.
  const marginPct = finSelected.netSalesAfterReturns > 0 ? (finSelected.grossProfit / finSelected.netSalesAfterReturns) * 100 : null;
  // Flag when some sold units' cost is missing entirely (legacy rows never recomputed), so the
  // owner doesn't read profit as more exact than it is.
  const hasUncostedSales = finSelected.uncostedQty > 0;
  const cashFlowNet = finSelected.totalSales - finSelected.totalPurchases;

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

      {/* ── Actual Profit: net sales → returns → COGS → gross profit, whole financial year ── */}
      {canSeeSales && (
      <div {...animateSection(3, `card ${styles.financialsCard}`)}>
        <div className={styles.financialsHeader}>
          <div>
            <h2 className={styles.cardHeaderTitle}>Actual Profit</h2>
            <div className={styles.financialsSub}>
              {loading ? "—" : (finPeriod.month0 === "all" ? "Full year" : "Month")}
              {" · "}{finPeriodLabel}
            </div>
          </div>
          <PeriodFilter value={finPeriod} onChange={setFinPeriod} disabled={loading} className={styles.financialsSelectWrap} />
        </div>

        {/* Compact financial tiles */}
        <div className={styles.finTileGrid}>
          <FinTile
            label="Total Sales" tone="blue" loading={loading}
            value={fmt(finSelected.grossSales)}
            help="Incl. GST"
            info="Total invoice value including GST (incl. transport charges)."
          />
          <FinTile
            label="GST Collected" tone="neutral" loading={loading}
            value={fmt(finSelected.gst)}
            help="GST within sales"
            info="The GST portion included in your total sales (incl. transport charge GST)."
          />
          <FinTile
            label="Net Sales" tone="blue" loading={loading}
            value={fmt(finSelected.netSalesAfterReturns)}
            help="After GST & returns"
            info="Total Sales, minus GST, minus the value of any credit notes (returns) — the real revenue actually earned and kept."
          />
          <FinTile
            label="COGS" tone="amber" loading={loading}
            value={fmt(finSelected.netCogs)}
            help="Cost of goods actually sold"
            info="Actual weighted-average cost of the goods sold (from real purchase-bill history), plus any transport charge billed to the customer (assumed at 0% margin), minus the cost of any returned quantity."
          />
          <FinTile
            label="Gross Profit" tone={finSelected.grossProfit < 0 ? "red" : "green"} loading={loading}
            value={fmt(finSelected.grossProfit)}
            help="Net Sales − COGS"
            info="Net Sales (after returns) minus Net Cost of Goods Sold."
          />
          <FinTile
            label="Profit Margin" tone={finSelected.grossProfit < 0 ? "red" : "green"} loading={loading}
            value={marginPct == null ? "—" : `${marginPct.toFixed(2)}%`}
            help="Gross Profit ÷ Net Sales"
            info="Gross Profit divided by Net Sales (after returns), shown as a percentage."
          />
        </div>

        {/* How your profit is calculated — collapsible, every step in order */}
        <div className={styles.calcBreakdown}>
          <button
            type="button"
            className={styles.calcToggle}
            aria-expanded={profitBreakdownOpen}
            aria-controls="profit-breakdown-panel"
            onClick={() => setProfitBreakdownOpen((v) => !v)}
          >
            <span>How your profit is calculated</span>
            <svg
              className={`${styles.calcToggleIcon} ${profitBreakdownOpen ? styles.calcToggleIconOpen : ""}`}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div id="profit-breakdown-panel" className={`${styles.calcAccordion} ${profitBreakdownOpen ? styles.calcAccordionOpen : ""}`}>
            <div className={styles.calcAccordionInner}>
              <div className={styles.calcAccordionContent}>
                <div className={styles.calcRow}><span>Total Sales <em>(incl. GST)</em></span><span>{loading ? "—" : fmt(finSelected.grossSales)}</span></div>
                <div className={styles.calcRow}><span>− GST</span><span className={styles.calcNeg}>{loading ? "—" : `− ${fmt(finSelected.gst)}`}</span></div>
                <div className={`${styles.calcRow} ${styles.calcSubtotal}`}><span>= Net Sales</span><span>{loading ? "—" : fmt(finSelected.netSales)}</span></div>
                <div className={styles.calcRow}><span>− Sales Returns <em>(credit notes, ex-GST)</em></span><span className={styles.calcNeg}>{loading ? "—" : `− ${fmt(finSelected.returnNet)}`}</span></div>
                <div className={`${styles.calcRow} ${styles.calcSubtotal}`}><span>= Net Sales After Returns</span><span>{loading ? "—" : fmt(finSelected.netSalesAfterReturns)}</span></div>
                <div className={styles.calcRow}><span>− COGS <em>(cost of goods sold, incl. sale transport at 0% margin)</em></span><span className={styles.calcNeg}>{loading ? "—" : `− ${fmt(finSelected.cogs)}`}</span></div>
                <div className={styles.calcRow}><span>+ Cost of Returned Goods</span><span>{loading ? "—" : `+ ${fmt(finSelected.returnCogs)}`}</span></div>
                <div className={styles.calcRow}><span>− Other Business Expenses <em>(purchase transport/freight)</em></span><span className={styles.calcNeg}>{loading ? "—" : `− ${fmt(finSelected.otherExpenses)}`}</span></div>
                <div className={`${styles.calcRow} ${styles.calcTotal}`}>
                  <span>= Gross Profit</span>
                  <span className={finSelected.grossProfit < 0 ? styles.calcLoss : styles.calcProfit}>{loading ? "—" : fmt(finSelected.grossProfit)}</span>
                </div>
                <div className={styles.financialsNote}>
                  COGS uses each product&apos;s real weighted-average purchase cost (from actual purchase-bill history), not just its list/master price — so it reflects what the goods actually cost, blended across every batch bought.
                </div>
              </div>
            </div>
          </div>
        </div>

        {!loading && hasUncostedSales && (
          <div className={styles.financialsWarn}>
            COGS and profit are understated for some sales — those line items have no cost data at all (usually a legacy sale from before cost tracking started). They&apos;ll be corrected the next time that product&apos;s history is recomputed.
          </div>
        )}
      </div>
      )}

      {/* ── Cash Flow: total money in vs total money out, simple totals (not profit) ── */}
      {(canSeeSales || canSeePurchases) && (
      <div {...animateSection(4, `card ${styles.financialsCard}`)}>
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
              help="Money billed to customers"
              info="Total invoice value including GST — the simple total billed, with nothing netted out."
            />
          )}
          {canSeePurchases && (
            <FinTile
              label="Total Purchases" tone="amber" loading={loading}
              value={fmt(finSelected.totalPurchases)}
              help="Money billed by vendors"
              info="Total purchase bill value including GST — everything bought in the period, whether or not it has sold yet."
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
        </div>

        <div className={styles.financialsNote}>
          This is a simple cash comparison — total billed vs total spent — not profit. A bulk purchase of stock that hasn&apos;t sold yet will show up here as a big spend with nothing to offset it; that&apos;s expected for a cash-flow view. For real profit (which correctly excludes unsold stock), see Actual Profit above.
        </div>
      </div>
      )}

      {/* Recent invoices & bills */}
      <div {...animateSection(5, styles.recentGrid)}>
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
        <div {...animateSection(6, `card ${styles.lowStockCard}`)}>
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
