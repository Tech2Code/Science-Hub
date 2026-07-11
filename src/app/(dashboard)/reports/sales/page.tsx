"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";
import styles from "./salesReports.module.css";

interface SummaryRow { invoicesThisMonth: number; revenueThisMonth: number; totalRevenue: number; totalCollected: number; outstandingTotal: number; pendingCount: number; }
interface OutstandingItem { id: string; invoiceNumber: string; date: string; createdAt: string; dueDate?: string; customer: { name: string }; total: number; paidAmount: number; balance: number; status: string; }
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

// Floors the date pickers so scrolling the native year spinner can't wander
// off into 1800s nonsense — no business data predates this.
const MIN_REPORT_DATE = "2015-01-01";

type Tab = "summary" | "outstanding" | "gst";

function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(row => row.map(escape).join(",")).join("\n");
}

// Excel auto-detects date-shaped CSV text and converts it to its internal
// date serial number, then shows "######" once the column is too narrow to
// display that number — wrapping as ="..." forces Excel to treat the cell
// as a literal text formula instead of a date.
function csvDate(s: string) {
  return s ? `="${s}"` : "";
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SalesReportsPage() {
  const [tab, setTab] = useState<Tab>("outstanding");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dateQuery = startDate || endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow>("/api/reports?type=summary");
  const { data: outstandingData, loading: loadingOut } = useFetch<OutstandingItem[]>(`/api/reports?type=outstanding${dateQuery}`);
  const { data: gstData, loading: loadingGst } = useFetch<GstRow[]>(`/api/reports?type=gst-summary${dateQuery}`);

  const outstanding = outstandingData ?? [];
  const gstRows = gstData ?? [];

  function exportOutstandingCsv() {
    const csv = toCsv(
      ["Invoice No.", "Customer", "Invoice Date", "Due Date", "Total", "Paid", "Balance", "Status"],
      outstanding.map(inv => [
        inv.invoiceNumber, inv.customer.name,
        csvDate(new Date(inv.date).toLocaleDateString("en-IN")),
        csvDate(inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : ""),
        inv.total, inv.paidAmount, inv.total - inv.paidAmount, inv.status,
      ])
    );
    downloadCsv("outstanding-invoices.csv", csv);
  }

  function exportGstCsv() {
    const csv = toCsv(
      ["Month", "Taxable Value", "CGST", "SGST", "IGST", "Total GST"],
      gstRows.map(r => [r.month, r.taxableValue, r.cgst, r.sgst, r.igst, r.cgst + r.sgst + r.igst])
    );
    downloadCsv("gst-summary.csv", csv);
  }

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const { visible: visibleOut } = usePagination(outstanding, outPage, outShowAll);

  const totalOutstanding = outstanding.reduce((sum, i) => sum + (i.total - i.paidAmount), 0);
  const totalGst = gstRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Reports</h1>
          <p className="page-sub">Revenue, outstanding payments, and GST summary</p>
        </div>
      </div>

      {/* KPI banners */}
      <div className="stat-banners">
        <div className="stat-banner stat-banner-blue">
          <div className="stat-banner-label">Revenue This Month</div>
          <div className="stat-banner-value">{loadingSummary ? "—" : fmt(summaryData?.revenueThisMonth ?? 0)}</div>
          <div className="stat-banner-sub">{loadingSummary ? "…" : `${summaryData?.invoicesThisMonth ?? 0} invoice${(summaryData?.invoicesThisMonth ?? 0) !== 1 ? "s" : ""} this month`}</div>
        </div>
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Outstanding</div>
          <div className="stat-banner-value">{loadingOut ? "—" : fmt(totalOutstanding)}</div>
          <div className="stat-banner-sub">{loadingOut ? "…" : `Across ${outstanding.length} unpaid/partial invoice${outstanding.length !== 1 ? "s" : ""}`}</div>
        </div>
        <div className="stat-banner stat-banner-green">
          <div className="stat-banner-label">Total Collected</div>
          <div className="stat-banner-value">{loadingSummary ? "—" : fmt(summaryData?.totalCollected ?? 0)}</div>
          <div className="stat-banner-sub">All time payments received</div>
        </div>
        <div className="stat-banner stat-banner-purple">
          <div className="stat-banner-label">Total GST Collected</div>
          <div className="stat-banner-value">{loadingGst ? "—" : fmt(totalGst)}</div>
          <div className="stat-banner-sub">CGST + SGST + IGST across all invoices</div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`card ${styles.tabsCard}`}>
        <div className={styles.tabsRow}>
          {(["outstanding", "summary", "gst"] as Tab[]).map((t) => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.active : ""}`} onClick={() => setTab(t)}>
              {t === "outstanding" ? "Outstanding" : t === "summary" ? "Summary" : "GST"}
            </button>
          ))}
        </div>

        {(tab === "outstanding" || tab === "gst") && (
          <div className={styles.dateFilterRow}>
            <label className={styles.dateFilterLabel}>
              From
              <input
                type="date" aria-label="Start date" value={startDate} min={MIN_REPORT_DATE} max={endDate || todayStr}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (endDate && v > endDate) setEndDate(v);
                }}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
                className={styles.dateInput}
              />
            </label>
            <label className={styles.dateFilterLabel}>
              To
              <input
                type="date" aria-label="End date" value={endDate} min={startDate || MIN_REPORT_DATE} max={todayStr}
                onChange={(e) => setEndDate(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
                className={styles.dateInput}
              />
            </label>
            {(startDate || endDate) && (
              <Button variant="secondary" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>Clear</Button>
            )}
          </div>
        )}

        {/* Outstanding tab */}
        {tab === "outstanding" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Outstanding Invoices</h2>
                <p className="card-header-sub">Invoices awaiting full payment</p>
              </div>
              <div className={styles.headerActionsRow}>
                {!loadingOut && outstanding.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={exportOutstandingCsv}>Export CSV</Button>
                )}
                {!loadingOut && (
                  <ShowAllToggle total={outstanding.length} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{OUT_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingOut ? <TableSkeleton cols={OUT_COLUMNS.length} /> : outstanding.length === 0 ? (
                    <tr><td colSpan={OUT_COLUMNS.length} className="table-empty-cell">No outstanding invoices. All settled.</td></tr>
                  ) : visibleOut.map((inv) => {
                    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                    return (
                      <tr key={inv.id} className={isOverdue ? styles.overdueRow : undefined}>
                        <Cell col={OUT_COLUMNS[0]}>
                          <Link href={`/sales/invoices/${inv.id}`} className="table-link">{inv.invoiceNumber}</Link>
                        </Cell>
                        <Cell col={OUT_COLUMNS[1]} className={styles.textMuted2}>{inv.customer.name}</Cell>
                        <Cell col={OUT_COLUMNS[2]} className={styles.textMuted3}>
                          <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                        </Cell>
                        <Cell col={OUT_COLUMNS[3]}>
                          {inv.dueDate ? (
                            <span
                              className={styles.dueDate}
                              style={{ "--due-color": isOverdue ? "var(--c-red)" : "var(--c-text-3)", "--due-weight": isOverdue ? 500 : 400 } as React.CSSProperties}
                            >
                              {new Date(inv.dueDate).toLocaleDateString("en-IN")}
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
            {!loadingOut && outstanding.length > 0 && (
              <Pagination total={outstanding.length} page={outPage} showAll={outShowAll} onPage={setOutPage} label="invoices" />
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
                <Button variant="secondary" size="sm" onClick={exportGstCsv}>Export CSV</Button>
              )}
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{GST_COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingGst ? <TableSkeleton cols={GST_COLUMNS.length} /> : gstRows.length === 0 ? (
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
