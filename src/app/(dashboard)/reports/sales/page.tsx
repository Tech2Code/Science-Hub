"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";

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

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

type Tab = "summary" | "outstanding" | "gst";

export default function SalesReportsPage() {
  const [tab, setTab] = useState<Tab>("outstanding");

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow>("/api/reports?type=summary");
  const { data: outstandingData, loading: loadingOut } = useFetch<OutstandingItem[]>("/api/reports?type=outstanding");
  const { data: gstData, loading: loadingGst } = useFetch<GstRow[]>("/api/reports?type=gst-summary");

  const outstanding = outstandingData ?? [];
  const gstRows = gstData ?? [];

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const { visible: visibleOut } = usePagination(outstanding, outPage, outShowAll);

  const totalOutstanding = outstanding.reduce((sum, i) => sum + (i.total - i.paidAmount), 0);
  const totalGst = gstRows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 1rem",
    fontSize: "0.8125rem",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--c-blue)" : "var(--c-text-3)",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--c-blue)" : "2px solid transparent",
    cursor: "pointer",
    marginBottom: "-1px",
  });

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
          <div className="stat-banner-sub">{summaryData?.invoicesThisMonth ?? 0} invoice{(summaryData?.invoicesThisMonth ?? 0) !== 1 ? "s" : ""} this month</div>
        </div>
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Outstanding</div>
          <div className="stat-banner-value">{loadingOut ? "—" : fmt(totalOutstanding)}</div>
          <div className="stat-banner-sub">Across {outstanding.length} unpaid/partial invoice{outstanding.length !== 1 ? "s" : ""}</div>
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
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--c-border)", padding: "0 1rem" }}>
          {(["outstanding", "summary", "gst"] as Tab[]).map((t) => (
            <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
              {t === "outstanding" ? "Outstanding" : t === "summary" ? "Summary" : "GST"}
            </button>
          ))}
        </div>

        {/* Outstanding tab */}
        {tab === "outstanding" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Outstanding Invoices</h2>
                <p className="card-header-sub">Invoices awaiting full payment</p>
              </div>
              {!loadingOut && (
                <ShowAllToggle total={outstanding.length} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
              )}
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
                      <tr key={inv.id} style={isOverdue ? { background: "var(--c-red-bg)" } : undefined}>
                        <Cell col={OUT_COLUMNS[0]}>
                          <Link href={`/sales/invoices/${inv.id}`} className="table-link">{inv.invoiceNumber}</Link>
                        </Cell>
                        <Cell col={OUT_COLUMNS[1]} style={{ color: "var(--c-text-2)" }}>{inv.customer.name}</Cell>
                        <Cell col={OUT_COLUMNS[2]} style={{ color: "var(--c-text-3)" }}>
                          <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                        </Cell>
                        <Cell col={OUT_COLUMNS[3]}>
                          {inv.dueDate ? (
                            <span style={{ color: isOverdue ? "var(--c-red)" : "var(--c-text-3)", fontWeight: isOverdue ? 500 : undefined }}>
                              {new Date(inv.dueDate).toLocaleDateString("en-IN")}
                              {isOverdue && " ⚠"}
                            </span>
                          ) : <span style={{ color: "var(--c-text-4)" }}>—</span>}
                        </Cell>
                        <Cell col={OUT_COLUMNS[4]} style={{ color: "var(--c-text-2)" }}>{fmt(inv.total)}</Cell>
                        <Cell col={OUT_COLUMNS[5]} style={{ color: "var(--c-green)" }}>{fmt(inv.paidAmount)}</Cell>
                        <Cell col={OUT_COLUMNS[6]} style={{ fontWeight: 500 }}>{fmt(inv.total - inv.paidAmount)}</Cell>
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
          <div style={{ padding: "1.25rem" }}>
            {loadingSummary ? (
              <div style={{ display: "grid", gap: "1rem" }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ height: 48, borderRadius: 8, background: "var(--c-border)", animation: "skPulse 1.4s ease-in-out infinite" }} />)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                {[
                  { label: "Revenue This Month", value: fmt(summaryData?.revenueThisMonth ?? 0), color: "var(--c-blue)" },
                  { label: "Invoices This Month", value: String(summaryData?.invoicesThisMonth ?? 0), color: "var(--c-text)" },
                  { label: "Total Revenue (All Time)", value: fmt(summaryData?.totalRevenue ?? 0), color: "var(--c-text)" },
                  { label: "Total Collected", value: fmt(summaryData?.totalCollected ?? 0), color: "var(--c-green-text)" },
                  { label: "Outstanding Balance", value: fmt(summaryData?.outstandingTotal ?? 0), color: "var(--c-amber)" },
                  { label: "Pending Invoices", value: String(summaryData?.pendingCount ?? 0), color: "var(--c-amber)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "1rem 1.125rem", borderRadius: "var(--radius)", border: "1px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.375rem" }}>{label}</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color }}>{value}</div>
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
                        <Cell col={GST_COLUMNS[0]} style={{ fontWeight: 500 }}>{row.month}</Cell>
                        <Cell col={GST_COLUMNS[1]} style={{ color: "var(--c-text-2)" }}>{fmt(row.taxableValue)}</Cell>
                        <Cell col={GST_COLUMNS[2]} style={{ color: "var(--c-text-3)" }}>{fmt(row.cgst)}</Cell>
                        <Cell col={GST_COLUMNS[3]} style={{ color: "var(--c-text-3)" }}>{fmt(row.sgst)}</Cell>
                        <Cell col={GST_COLUMNS[4]} style={{ color: "var(--c-text-3)" }}>{fmt(row.igst)}</Cell>
                        <Cell col={GST_COLUMNS[5]} style={{ fontWeight: 600, color: "var(--c-blue)" }}>{fmt(totalGstRow)}</Cell>
                      </tr>
                    );
                  })}
                </tbody>
                {gstRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
                      <td style={{ padding: "0.625rem 1rem", fontWeight: 700 }}>Total</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 600 }}>{fmt(gstRows.reduce((s, r) => s + r.taxableValue, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right" }}>{fmt(gstRows.reduce((s, r) => s + r.cgst, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right" }}>{fmt(gstRows.reduce((s, r) => s + r.sgst, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right" }}>{fmt(gstRows.reduce((s, r) => s + r.igst, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 700, color: "var(--c-blue)" }}>{fmt(totalGst)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );
}
