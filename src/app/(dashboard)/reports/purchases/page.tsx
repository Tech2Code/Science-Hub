"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { Cell, type Column } from "@/components/ui/Table";

interface SummaryRow { month: string; count: number; totalSpend: number; paid: number; payable: number; }
interface OutstandingBill {
  id: string; billNumber: string; billDate: string; dueDate?: string;
  vendor: { id: string; name: string };
  total: number; paidAmount: number; balance: number; status: string; aging: string;
}
interface CategoryRow { category: string; count: number; totalSpend: number; pct: number; }

const AGING_COLORS: Record<string, string> = {
  "Current": "var(--c-green-text)",
  "1–30 days": "var(--c-amber)",
  "31–60 days": "var(--c-red)",
  "60+ days": "var(--c-red)",
};

const SUMMARY_COLS: Column[] = [
  { label: "Month",       mobile: "label" },
  { label: "Bills",       cls: "table-th-right", mobile: "label" },
  { label: "Total Spend", cls: "table-th-right", mobile: "label" },
  { label: "Paid",        cls: "table-th-right", mobile: "label" },
  { label: "Payable",     cls: "table-th-right", mobile: "full+label" },
];

const OUT_COLS: Column[] = [
  { label: "Bill No.",  mobile: "label" },
  { label: "Vendor",   mobile: "label" },
  { label: "Bill Date", mobile: "label" },
  { label: "Due Date", mobile: "label" },
  { label: "Aging",    mobile: "label" },
  { label: "Total",    cls: "table-th-right", mobile: "label" },
  { label: "Paid",     cls: "table-th-right", mobile: "label" },
  { label: "Balance",  cls: "table-th-right", mobile: "full+label" },
  { label: "Status",   mobile: "full+label" },
];

const CAT_COLS: Column[] = [
  { label: "Category",    mobile: "label" },
  { label: "Bills",       cls: "table-th-right", mobile: "label" },
  { label: "Total Spend", cls: "table-th-right", mobile: "label" },
  { label: "% of Total",  cls: "table-th-right", mobile: "full+label" },
];

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

type Tab = "summary" | "outstanding" | "category";

export default function PurchaseReportsPage() {
  const [tab, setTab] = useState<Tab>("outstanding");

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow[]>("/api/purchase-reports?type=summary");
  const { data: outstandingData, loading: loadingOut } = useFetch<OutstandingBill[]>("/api/purchase-reports?type=outstanding");
  const { data: categoryData, loading: loadingCat } = useFetch<CategoryRow[]>("/api/purchase-reports?type=category");

  const summaryRows = summaryData ?? [];
  const outstanding = outstandingData ?? [];
  const categoryRows = categoryData ?? [];

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const { visible: visibleOut } = usePagination(outstanding, outPage, outShowAll);

  const totalPayable = outstanding.reduce((s, b) => s + b.balance, 0);
  const totalSpend = summaryRows.reduce((s, r) => s + r.totalSpend, 0);
  const overdueCount = outstanding.filter((b) => b.aging !== "Current").length;

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
          <h1 className="page-title">Purchase Reports</h1>
          <p className="page-sub">Spend summary, outstanding bills, and category breakdown</p>
        </div>
      </div>

      {/* KPI banners */}
      <div className="stat-banners">
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Spend (12 months)</div>
          <div className="stat-banner-value">{loadingSummary ? "—" : fmt(totalSpend)}</div>
          <div className="stat-banner-sub">{summaryRows.reduce((s, r) => s + r.count, 0)} bills</div>
        </div>
        <div className="stat-banner stat-banner-red">
          <div className="stat-banner-label">Total Payable</div>
          <div className="stat-banner-value">{loadingOut ? "—" : fmt(totalPayable)}</div>
          <div className="stat-banner-sub">Across {outstanding.length} unpaid/partial bill{outstanding.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="stat-banner stat-banner-purple">
          <div className="stat-banner-label">Overdue Bills</div>
          <div className="stat-banner-value">{loadingOut ? "—" : overdueCount}</div>
          <div className="stat-banner-sub">Bills past their due date</div>
        </div>
        <div className="stat-banner stat-banner-blue">
          <div className="stat-banner-label">Categories</div>
          <div className="stat-banner-value">{loadingCat ? "—" : categoryRows.length}</div>
          <div className="stat-banner-sub">Distinct purchase categories</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--c-border)", padding: "0 1rem" }}>
          {(["outstanding", "summary", "category"] as Tab[]).map((t) => (
            <button key={t} style={TAB_STYLE(tab === t)} onClick={() => setTab(t)}>
              {t === "outstanding" ? "Outstanding" : t === "summary" ? "Monthly Summary" : "By Category"}
            </button>
          ))}
        </div>

        {/* Outstanding tab */}
        {tab === "outstanding" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Outstanding Bills</h2>
                <p className="card-header-sub">Unpaid and partially paid purchase bills with aging</p>
              </div>
              {!loadingOut && (
                <ShowAllToggle total={outstanding.length} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
              )}
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{OUT_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingOut ? <TableSkeleton cols={OUT_COLS.length} /> : outstanding.length === 0 ? (
                    <tr><td colSpan={OUT_COLS.length} className="table-empty-cell">No outstanding bills. All settled.</td></tr>
                  ) : visibleOut.map((b) => {
                    const isOverdue = b.aging !== "Current";
                    return (
                      <tr key={b.id} style={isOverdue ? { background: "var(--c-red-bg)" } : undefined}>
                        <Cell col={OUT_COLS[0]}>
                          <Link href={`/purchases/bills/${b.id}`} className="table-link">{b.billNumber}</Link>
                        </Cell>
                        <Cell col={OUT_COLS[1]} style={{ color: "var(--c-text-2)" }}>
                          <Link href={`/purchases/vendors/${b.vendor.id}`} style={{ color: "inherit", textDecoration: "none" }}>{b.vendor.name}</Link>
                        </Cell>
                        <Cell col={OUT_COLS[2]} style={{ color: "var(--c-text-3)" }}>
                          {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </Cell>
                        <Cell col={OUT_COLS[3]}>
                          {b.dueDate
                            ? <span style={{ color: isOverdue ? "var(--c-red)" : "var(--c-text-3)", fontWeight: isOverdue ? 500 : undefined }}>
                                {new Date(b.dueDate).toLocaleDateString("en-IN")}
                                {isOverdue && " ⚠"}
                              </span>
                            : <span style={{ color: "var(--c-text-4)" }}>—</span>
                          }
                        </Cell>
                        <Cell col={OUT_COLS[4]}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 500, color: AGING_COLORS[b.aging] ?? "var(--c-text-3)" }}>
                            {b.aging}
                          </span>
                        </Cell>
                        <Cell col={OUT_COLS[5]} style={{ color: "var(--c-text-2)" }}>{fmt(b.total)}</Cell>
                        <Cell col={OUT_COLS[6]} style={{ color: "var(--c-green)" }}>{fmt(b.paidAmount)}</Cell>
                        <Cell col={OUT_COLS[7]} style={{ fontWeight: 500, color: "var(--c-amber)" }}>{fmt(b.balance)}</Cell>
                        <Cell col={OUT_COLS[8]}><StatusBadge status={b.status} /></Cell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!loadingOut && outstanding.length > 0 && (
              <Pagination total={outstanding.length} page={outPage} showAll={outShowAll} onPage={setOutPage} label="bills" />
            )}
          </>
        )}

        {/* Monthly Summary tab */}
        {tab === "summary" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Monthly Spend (Last 12 Months)</h2>
                <p className="card-header-sub">Total spend, paid, and payable per month</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{SUMMARY_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingSummary ? <TableSkeleton cols={SUMMARY_COLS.length} /> : summaryRows.length === 0 ? (
                    <tr><td colSpan={SUMMARY_COLS.length} className="table-empty-cell">No purchase data available.</td></tr>
                  ) : summaryRows.map((row) => (
                    <tr key={row.month}>
                      <Cell col={SUMMARY_COLS[0]} style={{ fontWeight: 500 }}>{row.month}</Cell>
                      <Cell col={SUMMARY_COLS[1]} style={{ color: "var(--c-text-3)" }}>{row.count}</Cell>
                      <Cell col={SUMMARY_COLS[2]} style={{ fontWeight: 500 }}>{fmt(row.totalSpend)}</Cell>
                      <Cell col={SUMMARY_COLS[3]} style={{ color: "var(--c-green-text)" }}>{fmt(row.paid)}</Cell>
                      <Cell col={SUMMARY_COLS[4]} style={{ color: row.payable > 0 ? "var(--c-amber)" : "var(--c-text-4)" }}>
                        {row.payable > 0 ? fmt(row.payable) : "—"}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
                {summaryRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--c-border)", background: "var(--c-bg-sub)" }}>
                      <td style={{ padding: "0.625rem 1rem", fontWeight: 700 }}>Total</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 600 }}>{summaryRows.reduce((s, r) => s + r.count, 0)}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 700 }}>{fmt(summaryRows.reduce((s, r) => s + r.totalSpend, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 600, color: "var(--c-green-text)" }}>{fmt(summaryRows.reduce((s, r) => s + r.paid, 0))}</td>
                      <td style={{ padding: "0.625rem 1rem", textAlign: "right", fontWeight: 600, color: "var(--c-amber)" }}>{fmt(summaryRows.reduce((s, r) => s + r.payable, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}

        {/* By Category tab */}
        {tab === "category" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Spend by Category</h2>
                <p className="card-header-sub">Total purchase spend grouped by category</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{CAT_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingCat ? <TableSkeleton cols={CAT_COLS.length} /> : categoryRows.length === 0 ? (
                    <tr><td colSpan={CAT_COLS.length} className="table-empty-cell">No purchase data available.</td></tr>
                  ) : categoryRows.map((row) => (
                    <tr key={row.category}>
                      <Cell col={CAT_COLS[0]} style={{ fontWeight: 500 }}>{row.category}</Cell>
                      <Cell col={CAT_COLS[1]} style={{ color: "var(--c-text-3)" }}>{row.count}</Cell>
                      <Cell col={CAT_COLS[2]} style={{ fontWeight: 600 }}>{fmt(row.totalSpend)}</Cell>
                      <Cell col={CAT_COLS[3]}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--c-border)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${row.pct}%`, background: "var(--c-amber)", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 500, minWidth: "3.5rem", textAlign: "right" }}>{row.pct}%</span>
                        </div>
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );
}
