"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import { Cell, type Column } from "@/components/ui/Table";
import { downloadXlsx } from "@/lib/downloadXlsx";
import styles from "./purchaseReports.module.css";

interface SummaryRow { month: string; count: number; totalSpend: number; paid: number; payable: number; }
interface OutstandingBill {
  id: string; billNumber: string; billDate: string; dueDate?: string;
  vendor: { id: string; name: string };
  total: number; paidAmount: number; balance: number; status: string; aging: string;
}
interface CategoryRow { category: string; count: number; totalSpend: number; pct: number; }
interface LedgerRow {
  id: string; productId: string | null; productName: string; type: string; documentType: string; quantity: number;
  balanceAfter: number; reference: string | null; notes: string | null; billNumber: string | null; createdAt: string;
}

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

const LEDGER_COLS: Column[] = [
  { label: "Date",       mobile: "label" },
  { label: "Product",    mobile: "label" },
  { label: "Type",       mobile: "label" },
  { label: "Document",   mobile: "full+label" },
  { label: "Qty",        cls: "table-th-right", mobile: "label" },
  { label: "Balance",    cls: "table-th-right", mobile: "label" },
  { label: "Reference",  mobile: "full+label" },
];

const LEDGER_TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase", purchase_edit_reverse: "Purchase Edit (Reverse)", purchase_edit_apply: "Purchase Edit (Apply)",
  purchase_cancel: "Purchase Cancel", purchase_uncancel: "Purchase Un-cancel", purchase_delete_restore: "Purchase Delete",
  purchase_bin_restore: "Purchase Bin Restore",
  sale: "Sale", sale_edit_reverse: "Sale Edit (Reverse)", sale_edit_apply: "Sale Edit (Apply)",
  sale_delete_restore: "Sale Delete", sale_bin_restore: "Sale Bin Restore",
  return: "Return", return_delete_reverse: "Return Delete", return_bin_restore: "Return Bin Restore",
  adjustment: "Adjustment", manual: "Manual",
};

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice", purchase_bill: "Purchase Bill", credit_note: "Credit Note", manual: "Manual",
};

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Floors the date pickers so scrolling the native year spinner can't wander
// off into 1800s nonsense — no business data predates this.
const MIN_REPORT_DATE = "2015-01-01";


type Tab = "summary" | "outstanding" | "category" | "ledger";

export default function PurchaseReportsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    if (!session.user?.sections?.includes("reports_purchases")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const isAdmin = session?.user?.role === "admin";
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("outstanding");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dateQuery = startDate || endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow[]>("/api/purchase-reports?type=summary");
  const { data: outstandingData, loading: loadingOut } = useFetch<OutstandingBill[]>(`/api/purchase-reports?type=outstanding${dateQuery}`);
  const { data: categoryData, loading: loadingCat } = useFetch<CategoryRow[]>("/api/purchase-reports?type=category");
  const { data: ledgerData, loading: loadingLedger, mutate: mutateLedger } = useFetch<LedgerRow[]>("/api/purchase-reports?type=stock-ledger");

  const [emptyLedgerOpen, setEmptyLedgerOpen] = useState(false);
  const [emptyLedgerLoading, setEmptyLedgerLoading] = useState(false);

  async function confirmEmptyLedger() {
    setEmptyLedgerLoading(true);
    try {
      const res = await fetch("/api/stock-movements?type=stock-ledger", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      setEmptyLedgerLoading(false);
      setEmptyLedgerOpen(false);
      if (res.ok) {
        mutateLedger();
        toast({ type: "success", title: "Stock ledger cleared", message: `${d.deleted ?? 0} record(s) permanently deleted.` });
      } else {
        toast({ type: "error", title: "Failed", message: d.error ?? "Could not clear stock ledger." });
      }
    } catch {
      setEmptyLedgerLoading(false);
      setEmptyLedgerOpen(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
  }

  const summaryRows = summaryData ?? [];
  const outstanding = outstandingData ?? [];
  const categoryRows = categoryData ?? [];
  const ledgerRows = ledgerData ?? [];

  const [ledgerSearch, setLedgerSearch] = useState("");
  const filteredLedger = ledgerRows.filter((m) => {
    const q = ledgerSearch.toLowerCase();
    if (!q) return true;
    return (
      m.productName.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q) ||
      m.documentType.toLowerCase().includes(q) ||
      m.reference?.toLowerCase().includes(q) ||
      m.billNumber?.toLowerCase().includes(q)
    );
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerShowAll, setLedgerShowAll] = useState(false);
  const { visible: visibleLedger } = usePagination(filteredLedger, ledgerPage, ledgerShowAll);

  const [exportingOutstanding, setExportingOutstanding] = useState(false);
  const [exportingCategory, setExportingCategory] = useState(false);
  const [exportingLedger, setExportingLedger] = useState(false);

  async function exportOutstandingCsv() {
    setExportingOutstanding(true);
    try {
      await downloadXlsx(
        "outstanding-bills.xlsx",
        "Outstanding Bills",
        ["Bill No.", "Vendor", "Bill Date", "Due Date", "Aging", "Total", "Paid", "Balance", "Status"],
        outstanding.map(b => [
          b.billNumber, b.vendor.name,
          new Date(b.billDate).toLocaleDateString("en-IN"),
          b.dueDate ? new Date(b.dueDate).toLocaleDateString("en-IN") : "",
          b.aging, b.total, b.paidAmount, b.balance, b.status,
        ])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingOutstanding(false);
    }
  }

  async function exportCategoryCsv() {
    setExportingCategory(true);
    try {
      await downloadXlsx(
        "spend-by-category.xlsx",
        "By Category",
        ["Category", "Bills", "Total Spend", "% of Total"],
        categoryRows.map(r => [r.category, r.count, r.totalSpend, r.pct])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingCategory(false);
    }
  }

  async function exportLedgerCsv() {
    setExportingLedger(true);
    try {
      await downloadXlsx(
        "stock-movement-ledger.xlsx",
        "Stock Ledger",
        ["Date", "Time", "Product", "Type", "Document", "Quantity", "Balance After", "Reference", "Bill No.", "Notes"],
        filteredLedger.map(m => [
          new Date(m.createdAt).toLocaleDateString("en-IN"),
          new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          m.productId ? m.productName : `${m.productName} (deleted)`,
          LEDGER_TYPE_LABEL[m.type] ?? m.type,
          DOCUMENT_TYPE_LABEL[m.documentType] ?? m.documentType,
          m.quantity,
          m.balanceAfter,
          m.reference ?? "",
          m.billNumber ?? "",
          m.notes ?? "",
        ])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingLedger(false);
    }
  }

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const { visible: visibleOut } = usePagination(outstanding, outPage, outShowAll);

  const totalPayable = outstanding.reduce((s, b) => s + b.balance, 0);
  const totalSpend = summaryRows.reduce((s, r) => s + r.totalSpend, 0);
  const overdueCount = outstanding.filter((b) => b.aging !== "Current").length;

  return (
    <div className="page-stack">
      <ConfirmDialog
        open={emptyLedgerOpen}
        title="Empty Stock Ledger"
        message={`Permanently delete all ${ledgerRows.length} stock movement record(s)? Product stock quantities are not affected — only this history log is cleared. This cannot be undone.`}
        confirmLabel="Empty Ledger"
        variant="danger"
        loading={emptyLedgerLoading}
        onConfirm={confirmEmptyLedger}
        onCancel={() => { if (!emptyLedgerLoading) setEmptyLedgerOpen(false); }}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Reports</h1>
          <p className="page-sub">Spend summary, outstanding bills, and category breakdown</p>
        </div>
      </div>

      {/* KPI banners */}
      <div {...animateSection(0, "stat-banners")}>
        <div className="stat-banner stat-banner-amber">
          <div className="stat-banner-label">Total Spend (12 months)</div>
          <div className="stat-banner-value">{loadingSummary ? "—" : fmt(totalSpend)}</div>
          <div className="stat-banner-sub">{loadingSummary ? "…" : `${summaryRows.reduce((s, r) => s + r.count, 0)} bills`}</div>
        </div>
        <div className="stat-banner stat-banner-red">
          <div className="stat-banner-label">Total Payable</div>
          <div className="stat-banner-value">{loadingOut ? "—" : fmt(totalPayable)}</div>
          <div className="stat-banner-sub">{loadingOut ? "…" : `Across ${outstanding.length} unpaid/partial bill${outstanding.length !== 1 ? "s" : ""}`}</div>
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
      <div {...animateSection(1, `card ${styles.tabsCard}`)}>
        <div className={styles.tabsRow}>
          {(["outstanding", "summary", "category", "ledger"] as Tab[]).map((t) => (
            <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.active : ""}`} onClick={() => setTab(t)}>
              {t === "outstanding" ? "Outstanding" : t === "summary" ? "Monthly Summary" : t === "category" ? "By Category" : "Stock Ledger"}
            </button>
          ))}
        </div>

        {tab === "outstanding" && (
          <div className={styles.dateFilterRow}>
            <label className={styles.dateFilterLabel}>
              From
              <Input
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
              <Input
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
                <h2 className="card-header-title">Outstanding Bills</h2>
                <p className="card-header-sub">Unpaid and partially paid purchase bills with aging</p>
              </div>
              <div className={styles.headerActionsRow}>
                {!loadingOut && outstanding.length > 0 && (
                  <Button variant="secondary" size="sm" loading={exportingOutstanding} onClick={exportOutstandingCsv}>Export Excel</Button>
                )}
                {!loadingOut && (
                  <ShowAllToggle total={outstanding.length} showAll={outShowAll} onToggle={() => { setOutShowAll((v) => !v); setOutPage(1); }} />
                )}
              </div>
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
                      <tr key={b.id} className={isOverdue ? styles.overdueRow : undefined}>
                        <Cell col={OUT_COLS[0]}>
                          <Link href={`/purchases/bills/${b.id}`} className="table-link">{b.billNumber}</Link>
                        </Cell>
                        <Cell col={OUT_COLS[1]} className={styles.textMuted2}>
                          <Link href={`/purchases/vendors/${b.vendor.id}`} className={styles.linkPlain}>{b.vendor.name}</Link>
                        </Cell>
                        <Cell col={OUT_COLS[2]} className={styles.textMuted3}>
                          {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </Cell>
                        <Cell col={OUT_COLS[3]}>
                          {b.dueDate
                            ? <span
                                className={styles.dueDate}
                                style={{ "--due-color": isOverdue ? "var(--c-red)" : "var(--c-text-3)", "--due-weight": isOverdue ? 500 : undefined } as React.CSSProperties}
                              >
                                {new Date(b.dueDate).toLocaleDateString("en-IN")}
                                {isOverdue && " ⚠"}
                              </span>
                            : <span className={styles.textMuted4}>—</span>
                          }
                        </Cell>
                        <Cell col={OUT_COLS[4]}>
                          <span className={styles.agingLabel} style={{ "--aging-color": AGING_COLORS[b.aging] ?? "var(--c-text-3)" } as React.CSSProperties}>
                            {b.aging}
                          </span>
                        </Cell>
                        <Cell col={OUT_COLS[5]} className={styles.textMuted2}>{fmt(b.total)}</Cell>
                        <Cell col={OUT_COLS[6]} className={styles.paidAmount}>{fmt(b.paidAmount)}</Cell>
                        <Cell col={OUT_COLS[7]} className={styles.balanceAmount}>{fmt(b.balance)}</Cell>
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
                      <Cell col={SUMMARY_COLS[0]} className={styles.rowFontMedium}>{row.month}</Cell>
                      <Cell col={SUMMARY_COLS[1]} className={styles.textMuted3}>{row.count}</Cell>
                      <Cell col={SUMMARY_COLS[2]} className={styles.rowFontMedium}>{fmt(row.totalSpend)}</Cell>
                      <Cell col={SUMMARY_COLS[3]} className={styles.paidGreen}>{fmt(row.paid)}</Cell>
                      <Cell
                        col={SUMMARY_COLS[4]}
                        className={styles.payableCell}
                        style={{ "--payable-color": row.payable > 0 ? "var(--c-amber)" : "var(--c-text-4)" } as React.CSSProperties}
                      >
                        {row.payable > 0 ? fmt(row.payable) : "—"}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
                {summaryRows.length > 0 && (
                  <tfoot>
                    <tr className={styles.footerRow}>
                      <Cell col={SUMMARY_COLS[0]} className={styles.footerCell}>Total</Cell>
                      <Cell col={SUMMARY_COLS[1]} className={styles.footerCellRight}>{summaryRows.reduce((s, r) => s + r.count, 0)}</Cell>
                      <Cell col={SUMMARY_COLS[2]} className={styles.footerCellRightBold}>{fmt(summaryRows.reduce((s, r) => s + r.totalSpend, 0))}</Cell>
                      <Cell col={SUMMARY_COLS[3]} className={styles.footerCellGreen}>{fmt(summaryRows.reduce((s, r) => s + r.paid, 0))}</Cell>
                      <Cell col={SUMMARY_COLS[4]} className={styles.footerCellAmber}>{fmt(summaryRows.reduce((s, r) => s + r.payable, 0))}</Cell>
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
              {!loadingCat && categoryRows.length > 0 && (
                <Button variant="secondary" size="sm" loading={exportingCategory} onClick={exportCategoryCsv}>Export Excel</Button>
              )}
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{CAT_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingCat ? <TableSkeleton cols={CAT_COLS.length} /> : categoryRows.length === 0 ? (
                    <tr><td colSpan={CAT_COLS.length} className="table-empty-cell">No purchase data available.</td></tr>
                  ) : categoryRows.map((row) => (
                    <tr key={row.category}>
                      <Cell col={CAT_COLS[0]} className={styles.rowFontMedium}>{row.category}</Cell>
                      <Cell col={CAT_COLS[1]} className={styles.textMuted3}>{row.count}</Cell>
                      <Cell col={CAT_COLS[2]} className={styles.categorySpend}>{fmt(row.totalSpend)}</Cell>
                      <Cell col={CAT_COLS[3]}>
                        <div className={styles.pctCellWrap}>
                          <div className={styles.pctBarTrack}>
                            <div className={styles.pctBarFill} style={{ "--bar-pct": `${row.pct}%` } as React.CSSProperties} />
                          </div>
                          <span className={styles.pctValue}>{row.pct}%</span>
                        </div>
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Stock Ledger tab */}
        {tab === "ledger" && (
          <>
            <div className="card-header">
              <div>
                <h2 className="card-header-title">Stock Movement Ledger</h2>
                <p className="card-header-sub">
                  Full history of stock changes (purchase, sale, adjustment, return) — most recent 500. Records for deleted
                  products remain here permanently for audit purposes.
                </p>
              </div>
              <div className={styles.headerActionsRow}>
                {!loadingLedger && filteredLedger.length > 0 && (
                  <Button variant="secondary" size="sm" loading={exportingLedger} onClick={exportLedgerCsv}>Export Excel</Button>
                )}
                {!loadingLedger && (
                  <ShowAllToggle total={filteredLedger.length} showAll={ledgerShowAll} onToggle={() => { setLedgerShowAll((v) => !v); setLedgerPage(1); }} />
                )}
                {isAdmin && !loadingLedger && ledgerRows.length > 0 && (
                  <Button variant="dangerOutline" size="sm" onClick={() => setEmptyLedgerOpen(true)}>
                    Empty Stock Ledger
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.dateFilterRow}>
              <Input
                type="search"
                aria-label="Search stock ledger"
                placeholder="Search by product, type, or reference…"
                value={ledgerSearch}
                onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                className=""
              />
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead><tr>{LEDGER_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {loadingLedger ? <TableSkeleton cols={LEDGER_COLS.length} /> : filteredLedger.length === 0 ? (
                    <tr><td colSpan={LEDGER_COLS.length} className="table-empty-cell">{ledgerSearch ? "No stock movements match your search." : "No stock movements recorded."}</td></tr>
                  ) : visibleLedger.map((m) => (
                    <tr key={m.id}>
                      <Cell col={LEDGER_COLS[0]} className={styles.textMuted3}>
                        {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </Cell>
                      <Cell col={LEDGER_COLS[1]} className={styles.rowFontMedium}>
                        {m.productId ? (
                          <Link href={`/products/${m.productId}`} className="table-link">{m.productName}</Link>
                        ) : (
                          <span className={styles.textMuted4}>{m.productName} (deleted)</span>
                        )}
                      </Cell>
                      <Cell col={LEDGER_COLS[2]} className={styles.textMuted3}>{LEDGER_TYPE_LABEL[m.type] ?? m.type}</Cell>
                      <Cell col={LEDGER_COLS[3]} className={styles.textMuted3}>{DOCUMENT_TYPE_LABEL[m.documentType] ?? m.documentType}</Cell>
                      <Cell col={LEDGER_COLS[4]} className={m.quantity >= 0 ? styles.paidGreen : styles.balanceAmount}>
                        {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                      </Cell>
                      <Cell col={LEDGER_COLS[5]} className={styles.textMuted2}>{m.balanceAfter}</Cell>
                      <Cell col={LEDGER_COLS[6]} className={styles.textMuted4}>
                        {m.billNumber ?? m.reference ?? "—"}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loadingLedger && filteredLedger.length > 0 && (
              <Pagination total={filteredLedger.length} page={ledgerPage} showAll={ledgerShowAll} onPage={setLedgerPage} label="movements" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
