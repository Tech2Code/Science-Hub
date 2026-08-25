"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton, SkeletonSwap } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { HeaderActionsRow } from "@/components/ui/HeaderActionsRow";
import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { downloadXlsx } from "@/lib/downloadXlsx";
import { formatDate } from "@/lib/formatDate";
import styles from "./salesReports.module.css";

interface SummaryRow { invoicesThisMonth: number; revenueThisMonth: number; totalRevenue: number; totalCollected: number; outstandingTotal: number; pendingCount: number; }
interface OutstandingItem { id: string; invoiceNumber: string; date: string; createdAt: string; dueDate?: string; customer: { name: string }; total: number; paidAmount: number; balance: number; status: string; }
interface OutstandingResponse { data: OutstandingItem[]; total: number; totalBalance: number; }
interface GstRow { month: string; taxableValue: number; cgst: number; sgst: number; igst: number; }

const OUT_COLUMNS: Column[] = [
  { label: "Invoice No.",  mobile: "label" },
  { label: "Customer",     mobile: "label" },
  { label: "Invoice Date", mobile: "label" },
  { label: "Due Date",     mobile: "label" },
  { label: "Total",        cls: "table-th-right", mobile: "label" },
  { label: "Paid",         cls: "table-th-right", mobile: "label" },
  { label: "Balance",      cls: "table-th-right", mobile: "full+label" },
  { label: "Status",       mobile: "full+label" },
];

const GST_COLUMNS: Column[] = [
  { label: "Month",          mobile: "label" },
  { label: "Taxable Value",  cls: "table-th-right", mobile: "label" },
  { label: "CGST",           cls: "table-th-right", mobile: "label" },
  { label: "SGST",           cls: "table-th-right", mobile: "label" },
  { label: "IGST",           cls: "table-th-right", mobile: "label" },
  { label: "Total GST",      cls: "table-th-right", mobile: "full+label" },
];

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = "summary" | "outstanding" | "gst";

export default function SalesReportsPage() {
  const { data: session } = useSession();
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    if (!session.user?.sections?.includes("reports_sales")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const [tab, setTab] = useState<Tab>("outstanding");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dateQuery = startDate || endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const outPageSize = outShowAll ? 2000 : PAGE_SIZE;

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow>("/api/reports?type=summary");
  const { data: outstandingResponse, loading: loadingOut } = useFetch<OutstandingResponse>(
    `/api/reports?type=outstanding${dateQuery}&page=${outPage}&pageSize=${outPageSize}`
  );
  const { data: gstData, loading: loadingGst } = useFetch<GstRow[]>(`/api/reports?type=gst-summary${dateQuery}`);

  const outstanding = outstandingResponse?.data ?? [];
  const outTotal = outstandingResponse?.total ?? 0;
  const outTotalBalance = outstandingResponse?.totalBalance ?? 0;
  const showOutSkeleton = loadingOut && !outstandingResponse;
  const isOutRefetching = loadingOut && !!outstandingResponse;
  const gstRows = gstData ?? [];

  const [exportingOutstanding, setExportingOutstanding] = useState(false);
  const [exportingGst, setExportingGst] = useState(false);

  async function exportOutstandingCsv() {
    setExportingOutstanding(true);
    try {
      const res = await fetch(`/api/reports?type=outstanding${dateQuery}&page=1&pageSize=2000`);
      const exportData: OutstandingResponse = await res.json();
      await downloadXlsx(
        "outstanding-invoices.xlsx",
        "Outstanding Invoices",
        ["Invoice No.", "Customer", "Invoice Date", "Due Date", "Total", "Paid", "Balance", "Status"],
        exportData.data.map(inv => [
          inv.invoiceNumber, inv.customer.name,
          formatDate(inv.date),
          inv.dueDate ? formatDate(inv.dueDate) : "",
          inv.total, inv.paidAmount, inv.total - inv.paidAmount, inv.status,
        ])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingOutstanding(false);
    }
  }

  async function exportGstCsv() {
    setExportingGst(true);
    try {
      await downloadXlsx(
        "gst-summary.xlsx",
        "GST Summary",
        ["Month", "Taxable Value", "CGST", "SGST", "IGST", "Total GST"],
        gstRows.map(r => [r.month, r.taxableValue, r.cgst, r.sgst, r.igst, r.cgst + r.sgst + r.igst])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingGst(false);
    }
  }

  const totalGst = gstRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);

  return (
    <div className="page-stack">
      {exportingOutstanding && <OverlayLoader text="Generating Excel file…" />}
      {exportingGst && <OverlayLoader text="Generating Excel file…" />}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Reports</h1>
          <p className="page-sub">Revenue, outstanding payments, and GST summary</p>
        </div>
      </div>

      {/* KPI banners */}
      <div {...animateSection(0, "stat-banners")}>
        <div className="stat-banner stat-banner-blue">
          <div className="stat-banner-label">Revenue This Month</div>
          <div className="stat-banner-value"><SkeletonSwap loading={loadingSummary} w={90} h={20}>{fmt(summaryData?.revenueThisMonth ?? 0)}</SkeletonSwap></div>
          <div className="stat-banner-sub"><SkeletonSwap loading={loadingSummary} w={140} h={13}>{`${summaryData?.invoicesThisMonth ?? 0} invoice${(summaryData?.invoicesThisMonth ?? 0) !== 1 ? "s" : ""} this month`}</SkeletonSwap></div>
        </div>
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Outstanding</div>
          <div className="stat-banner-value"><SkeletonSwap loading={showOutSkeleton} w={90} h={20}>{fmt(outTotalBalance)}</SkeletonSwap></div>
          <div className="stat-banner-sub"><SkeletonSwap loading={showOutSkeleton} w={140} h={13}>{`Across ${outTotal} unpaid/partial invoice${outTotal !== 1 ? "s" : ""}`}</SkeletonSwap></div>
        </div>
        <div className="stat-banner stat-banner-green">
          <div className="stat-banner-label">Total Collected</div>
          <div className="stat-banner-value"><SkeletonSwap loading={loadingSummary} w={90} h={20}>{fmt(summaryData?.totalCollected ?? 0)}</SkeletonSwap></div>
          <div className="stat-banner-sub">All time payments received</div>
        </div>
        <div className="stat-banner stat-banner-purple">
          <div className="stat-banner-label">Total GST Collected</div>
          <div className="stat-banner-value"><SkeletonSwap loading={loadingGst} w={90} h={20}>{fmt(totalGst)}</SkeletonSwap></div>
          <div className="stat-banner-sub">CGST + SGST + IGST across all invoices</div>
        </div>
      </div>

      {/* Tabs */}
      <div {...animateSection(1, `card ${styles.tabsCard}`)}>
        <div className={styles.tabsRow}>
          {(["outstanding", "summary", "gst"] as Tab[]).map((t) => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.active : ""}`} onClick={() => setTab(t)}>
              {t === "outstanding" ? "Outstanding" : t === "summary" ? "Summary" : "GST"}
            </button>
          ))}
        </div>

        {(tab === "outstanding" || tab === "gst") && (
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            todayStr={todayStr}
            onStartChange={(v) => { setStartDate(v); setOutPage(1); }}
            onEndChange={(v) => { setEndDate(v); setOutPage(1); }}
            onClear={() => { setStartDate(""); setEndDate(""); setOutPage(1); }}
          />
        )}

        {/* Outstanding tab */}
        {tab === "outstanding" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Outstanding Invoices</h2>
                <p className="card-header-sub">Invoices awaiting full payment</p>
              </div>
              <HeaderActionsRow>
                {outstandingResponse && outTotal > 0 && (
                  <Button variant="secondary" size="sm" loading={exportingOutstanding} onClick={exportOutstandingCsv}>Export Excel</Button>
                )}
                {outstandingResponse && (
                  <ShowAllToggle total={outTotal} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
                )}
              </HeaderActionsRow>
            </div>
            <div className="table-wrap">
              <table className="table-base" style={isOutRefetching ? { opacity: 0.5, transition: "opacity 0.15s" } : undefined}>
                <thead><tr>{OUT_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {showOutSkeleton ? <TableSkeleton columns={OUT_COLUMNS} /> : outstanding.length === 0 ? (
                    <tr><td colSpan={OUT_COLUMNS.length} className="table-empty-cell">No outstanding invoices. All settled.</td></tr>
                  ) : outstanding.map((inv) => {
                    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                    return (
                      <tr key={inv.id} className={isOverdue ? styles.overdueRow : undefined}>
                        <Cell col={OUT_COLUMNS[0]}>
                          <Link href={`/sales/invoices/${inv.id}`} className="table-link">{inv.invoiceNumber}</Link>
                        </Cell>
                        <Cell col={OUT_COLUMNS[1]} className={styles.textMuted2}>{inv.customer.name}</Cell>
                        <Cell col={OUT_COLUMNS[2]} className={styles.textMuted3}>
                          <div>{formatDate(inv.date)}</div>
                        </Cell>
                        <Cell col={OUT_COLUMNS[3]}>
                          {inv.dueDate ? (
                            <span
                              className={styles.dueDate}
                              style={{ "--due-color": isOverdue ? "var(--c-red)" : "var(--c-text-3)", "--due-weight": isOverdue ? 500 : 400 } as React.CSSProperties}
                            >
                              {formatDate(inv.dueDate)}
                              {isOverdue && " ⚠"}
                            </span>
                          ) : <span className={styles.textMuted4}>—</span>}
                        </Cell>
                        <Cell col={OUT_COLUMNS[4]} className={styles.textMuted2}>{fmt(inv.total)}</Cell>
                        <Cell col={OUT_COLUMNS[5]} className={styles.textGreen}>{fmt(inv.paidAmount)}</Cell>
                        <Cell col={OUT_COLUMNS[6]} className={styles.fontMed}>{fmt(inv.total - inv.paidAmount)}</Cell>
                        <Cell col={OUT_COLUMNS[7]}><StatusBadge status={inv.status} /></Cell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {outstandingResponse && outTotal > 0 && (
              <Pagination total={outTotal} page={outPage} showAll={outShowAll} onPage={setOutPage} label="invoices" loading={isOutRefetching} />
            )}
          </>
        )}

        {/* Summary tab */}
        {tab === "summary" && (
          <div className={styles.summaryTabPanel}>
            {loadingSummary ? (
              <div className={styles.summarySkeletonGrid}>
                {[...Array(4)].map((_, i) => <div key={i} className={styles.summarySkeletonItem} />)}
              </div>
            ) : (
              <div className={styles.summaryGrid}>
                {[
                  { label: "Revenue This Month", value: fmt(summaryData?.revenueThisMonth ?? 0), color: "var(--c-blue)" },
                  { label: "Invoices This Month", value: String(summaryData?.invoicesThisMonth ?? 0), color: "var(--c-text)" },
                  { label: "Total Revenue (All Time)", value: fmt(summaryData?.totalRevenue ?? 0), color: "var(--c-text)" },
                  { label: "Total Collected", value: fmt(summaryData?.totalCollected ?? 0), color: "var(--c-green-text)" },
                  { label: "Outstanding Balance", value: fmt(summaryData?.outstandingTotal ?? 0), color: "var(--c-amber)" },
                  { label: "Pending Invoices", value: String(summaryData?.pendingCount ?? 0), color: "var(--c-amber)" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={styles.summaryCard}>
                    <div className={styles.summaryCardLabel}>{label}</div>
                    <div className={styles.summaryCardValue} style={{ "--summary-color": color } as React.CSSProperties}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GST tab */}
        {tab === "gst" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">GST Summary</h2>
                <p className="card-header-sub">Monthly GST breakdown across all invoices</p>
              </div>
              {!loadingGst && gstRows.length > 0 && (
                <Button variant="secondary" size="sm" loading={exportingGst} onClick={exportGstCsv}>Export Excel</Button>
              )}
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{GST_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingGst ? <TableSkeleton columns={GST_COLUMNS} /> : gstRows.length === 0 ? (
                    <tr><td colSpan={GST_COLUMNS.length} className="table-empty-cell">No invoice data available.</td></tr>
                  ) : gstRows.map((row) => {
                    const totalGstRow = row.cgst + row.sgst + row.igst;
                    return (
                      <tr key={row.month}>
                        <Cell col={GST_COLUMNS[0]} className={styles.gstMonthCell}>{row.month}</Cell>
                        <Cell col={GST_COLUMNS[1]} className={styles.textMuted2}>{fmt(row.taxableValue)}</Cell>
                        <Cell col={GST_COLUMNS[2]} className={styles.textMuted3}>{fmt(row.cgst)}</Cell>
                        <Cell col={GST_COLUMNS[3]} className={styles.textMuted3}>{fmt(row.sgst)}</Cell>
                        <Cell col={GST_COLUMNS[4]} className={styles.textMuted3}>{fmt(row.igst)}</Cell>
                        <Cell col={GST_COLUMNS[5]} className={styles.gstFontBold}>{fmt(totalGstRow)}</Cell>
                      </tr>
                    );
                  })}
                </tbody>
                {gstRows.length > 0 && (
                  <tfoot>
                    <tr className={styles.gstFootRow}>
                      <Cell col={GST_COLUMNS[0]} className={styles.gstFootTotalLabel}>Total</Cell>
                      <Cell col={GST_COLUMNS[1]} className={styles.gstFootTotalValue}>{fmt(gstRows.reduce((s, r) => s + r.taxableValue, 0))}</Cell>
                      <Cell col={GST_COLUMNS[2]} className={styles.gstFootCellRight}>{fmt(gstRows.reduce((s, r) => s + r.cgst, 0))}</Cell>
                      <Cell col={GST_COLUMNS[3]} className={styles.gstFootCellRight}>{fmt(gstRows.reduce((s, r) => s + r.sgst, 0))}</Cell>
                      <Cell col={GST_COLUMNS[4]} className={styles.gstFootCellRight}>{fmt(gstRows.reduce((s, r) => s + r.igst, 0))}</Cell>
                      <Cell col={GST_COLUMNS[5]} className={styles.gstFootGrandTotal}>{fmt(totalGst)}</Cell>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
