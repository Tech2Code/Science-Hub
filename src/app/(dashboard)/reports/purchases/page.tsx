"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton, SkeletonSwap } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SearchField } from "@/components/ui/SearchField";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { HeaderActionsRow } from "@/components/ui/HeaderActionsRow";
import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { animateSection } from "@/lib/animateSection";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { downloadXlsx } from "@/lib/downloadXlsx";
import { formatDate } from "@/lib/formatDate";
import styles from "./purchaseReports.module.css";

interface SummaryRow { month: string; count: number; totalSpend: number; paid: number; payable: number; }
interface OutstandingBill {
  id: string; billNumber: string; billDate: string; dueDate?: string;
  vendor: { id: string; name: string };
  total: number; paidAmount: number; balance: number; status: string; aging: string;
}
interface OutstandingResponse { data: OutstandingBill[]; total: number; totalBalance: number; overdueCount: number; }
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

  const toast = useToast();
  const [tab, setTab] = useState<Tab>("outstanding");
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dateQuery = startDate || endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";

  const [outPage, setOutPage] = useState(1);
  const [outShowAll, setOutShowAll] = useState(false);
  const outPageSize = outShowAll ? 2000 : PAGE_SIZE;

  const { data: summaryData, loading: loadingSummary } = useFetch<SummaryRow[]>("/api/purchase-reports?type=summary");
  const { data: outstandingResponse, loading: loadingOut } = useFetch<OutstandingResponse>(
    `/api/purchase-reports?type=outstanding${dateQuery}&page=${outPage}&pageSize=${outPageSize}`
  );
  const { data: categoryData, loading: loadingCat } = useFetch<CategoryRow[]>("/api/purchase-reports?type=category");

  const summaryRows = summaryData ?? [];
  const outstanding = outstandingResponse?.data ?? [];
  const outTotal = outstandingResponse?.total ?? 0;
  const outTotalBalance = outstandingResponse?.totalBalance ?? 0;
  const outOverdueCount = outstandingResponse?.overdueCount ?? 0;
  const showOutSkeleton = loadingOut && !outstandingResponse;
  const isOutRefetching = loadingOut && !!outstandingResponse;
  const categoryRows = categoryData ?? [];

  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerShowAll, setLedgerShowAll] = useState(false);
  const debouncedLedgerSearch = useDebouncedValue(ledgerSearch, 300);
  const ledgerPageSize = ledgerShowAll ? 5000 : PAGE_SIZE;

  const ledgerParams = new URLSearchParams({ type: "stock-ledger" });
  if (debouncedLedgerSearch.trim()) ledgerParams.set("search", debouncedLedgerSearch.trim());
  ledgerParams.set("page", String(ledgerPage));
  ledgerParams.set("pageSize", String(ledgerPageSize));
  const { data: ledgerResponse, loading: loadingLedger } = useFetch<{ data: LedgerRow[]; total: number }>(`/api/purchase-reports?${ledgerParams.toString()}`);
  const filteredLedger = ledgerResponse?.data ?? [];
  const ledgerTotal = ledgerResponse?.total ?? 0;
  const showLedgerSkeleton = loadingLedger && !ledgerResponse;
  const isLedgerRefetching = loadingLedger && !!ledgerResponse;

  const [exportingOutstanding, setExportingOutstanding] = useState(false);
  const [exportingCategory, setExportingCategory] = useState(false);
  const [exportingLedger, setExportingLedger] = useState(false);

  async function exportOutstandingCsv() {
    setExportingOutstanding(true);
    try {
      const res = await fetch(`/api/purchase-reports?type=outstanding${dateQuery}&page=1&pageSize=2000`);
      const exportData: OutstandingResponse = await res.json();
      await downloadXlsx(
        "outstanding-bills.xlsx",
        "Outstanding Bills",
        ["Bill No.", "Vendor", "Bill Date", "Due Date", "Aging", "Total", "Paid", "Balance", "Status"],
        exportData.data.map(b => [
          b.billNumber, b.vendor.name,
          formatDate(b.billDate),
          b.dueDate ? formatDate(b.dueDate) : "",
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
      const exportParams = new URLSearchParams({ type: "stock-ledger", page: "1", pageSize: "5000" });
      if (debouncedLedgerSearch.trim()) exportParams.set("search", debouncedLedgerSearch.trim());
      const res = await fetch(`/api/purchase-reports?${exportParams.toString()}`);
      const exportData: { data: LedgerRow[]; total: number } = await res.json();
      await downloadXlsx(
        "stock-movement-ledger.xlsx",
        "Stock Ledger",
        ["Date", "Time", "Product", "Type", "Document", "Quantity", "Balance After", "Reference", "Bill No.", "Notes"],
        exportData.data.map(m => [
          formatDate(m.createdAt),
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

  const totalSpend = summaryRows.reduce((s, r) => s + r.totalSpend, 0);

  return (
    <div className="page-stack">
      {(exportingOutstanding || exportingCategory || exportingLedger) && <OverlayLoader text="Generating Excel file…" />}
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
          <div className="stat-banner-value"><SkeletonSwap loading={loadingSummary} w={90} h={20}>{fmt(totalSpend)}</SkeletonSwap></div>
          <div className="stat-banner-sub"><SkeletonSwap loading={loadingSummary} w={80} h={13}>{`${summaryRows.reduce((s, r) => s + r.count, 0)} bills`}</SkeletonSwap></div>
        </div>
        <div className="stat-banner stat-banner-red">
          <div className="stat-banner-label">Total Payable</div>
          <div className="stat-banner-value"><SkeletonSwap loading={showOutSkeleton} w={90} h={20}>{fmt(outTotalBalance)}</SkeletonSwap></div>
          <div className="stat-banner-sub"><SkeletonSwap loading={showOutSkeleton} w={140} h={13}>{`Across ${outTotal} unpaid/partial bill${outTotal !== 1 ? "s" : ""}`}</SkeletonSwap></div>
        </div>
        <div className="stat-banner stat-banner-purple">
          <div className="stat-banner-label">Overdue Bills</div>
          <div className="stat-banner-value"><SkeletonSwap loading={showOutSkeleton} w={50} h={20}>{outOverdueCount}</SkeletonSwap></div>
          <div className="stat-banner-sub">Bills past their due date</div>
        </div>
        <div className="stat-banner stat-banner-blue">
          <div className="stat-banner-label">Categories</div>
          <div className="stat-banner-value"><SkeletonSwap loading={loadingCat} w={50} h={20}>{categoryRows.length}</SkeletonSwap></div>
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
                <h2 className="card-header-title">Outstanding Bills</h2>
                <p className="card-header-sub">Unpaid and partially paid purchase bills with aging</p>
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
                <thead><tr>{OUT_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {showOutSkeleton ? <TableSkeleton columns={OUT_COLS} /> : outstanding.length === 0 ? (
                    <tr><td colSpan={OUT_COLS.length} className="table-empty-cell">No outstanding bills. All settled.</td></tr>
                  ) : outstanding.map((b) => {
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
                          {formatDate(b.billDate)}
                        </Cell>
                        <Cell col={OUT_COLS[3]}>
                          {b.dueDate
                            ? <span
                                className={styles.dueDate}
                                style={{ "--due-color": isOverdue ? "var(--c-red)" : "var(--c-text-3)", "--due-weight": isOverdue ? 500 : undefined } as React.CSSProperties}
                              >
                                {formatDate(b.dueDate)}
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
            {outstandingResponse && outTotal > 0 && (
              <Pagination total={outTotal} page={outPage} showAll={outShowAll} onPage={setOutPage} label="bills" loading={isOutRefetching} />
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
                  {loadingSummary ? <TableSkeleton columns={SUMMARY_COLS} /> : summaryRows.length === 0 ? (
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
                  {loadingCat ? <TableSkeleton columns={CAT_COLS} /> : categoryRows.length === 0 ? (
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
                  Full history of stock changes (purchase, sale, adjustment, return). Records for deleted
                  products remain here permanently for audit purposes.
                </p>
              </div>
              <HeaderActionsRow>
                {ledgerResponse && ledgerTotal > 0 && (
                  <Button variant="secondary" size="sm" loading={exportingLedger} onClick={exportLedgerCsv}>Export Excel</Button>
                )}
                {ledgerResponse && (
                  <ShowAllToggle total={ledgerTotal} showAll={ledgerShowAll} onToggle={() => { setLedgerShowAll((v) => !v); setLedgerPage(1); }} />
                )}
              </HeaderActionsRow>
            </div>
            <div className="card-toolbar">
              <SearchField
                aria-label="Search stock ledger"
                placeholder="Search by product, type, or reference…"
                value={ledgerSearch}
                onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
              />
            </div>
            <div className="table-wrap">
              <table className="table-base" style={isLedgerRefetching ? { opacity: 0.5, transition: "opacity 0.15s" } : undefined}>
                <thead><tr>{LEDGER_COLS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr></thead>
                <tbody>
                  {showLedgerSkeleton ? <TableSkeleton columns={LEDGER_COLS} /> : filteredLedger.length === 0 ? (
                    <tr><td colSpan={LEDGER_COLS.length} className="table-empty-cell">{ledgerSearch ? "No stock movements match your search." : "No stock movements recorded."}</td></tr>
                  ) : filteredLedger.map((m) => (
                    <tr key={m.id}>
                      <Cell col={LEDGER_COLS[0]} className={styles.textMuted3}>
                        {formatDate(m.createdAt)}
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
            {ledgerResponse && ledgerTotal > 0 && (
              <Pagination total={ledgerTotal} page={ledgerPage} showAll={ledgerShowAll} onPage={setLedgerPage} label="movements" loading={isLedgerRefetching} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
