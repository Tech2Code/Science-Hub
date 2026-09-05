"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { HeaderActionsRow } from "@/components/ui/HeaderActionsRow";
import { SortSelect } from "@/components/ui/SortSelect";
import { downloadXlsx } from "@/lib/downloadXlsx";
import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import type { Column } from "@/components/ui/Table";
import styles from "./ewayBill.module.css";

const ROW_COLUMNS: Column[] = [
  { label: "Doc No.", mobile: "full" },
  { label: "Date", mobile: "label" },
  { label: "Party", mobile: "label" },
  { label: "Place of Supply", mobile: "label" },
  { label: "Movement", mobile: "label" },
  { label: "Value", cls: "table-th-right", mobile: "label" },
];

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface SalesRow { id: string; invoiceNumber: string; date: string; customerName: string; placeOfSupply: string | null; isInterState: boolean; total: number; }
interface PurchaseRow { id: string; billNumber: string; billDate: string; vendorName: string; placeOfSupply: string | null; isInterState: boolean; total: number; }
interface EwayBillReport { threshold: number; sales: SalesRow[]; purchases: PurchaseRow[]; }

type SortOption = "newest" | "oldest" | "value_high" | "value_low";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Latest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "value_high", label: "Value: High to Low" },
  { value: "value_low", label: "Value: Low to High" },
];

function sortRows<T>(rows: T[], sort: SortOption, dateOf: (r: T) => string, valueOf: (r: T) => number): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sort) {
      case "newest": return new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime();
      case "oldest": return new Date(dateOf(a)).getTime() - new Date(dateOf(b)).getTime();
      case "value_high": return valueOf(b) - valueOf(a);
      case "value_low": return valueOf(a) - valueOf(b);
    }
  });
  return sorted;
}

function ymd(year: number, month1to12: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function todayStr() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
export default function EwayBillReportPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!session) return;
    const role = session.user?.role;
    if (role === "admin") return;
    const sections = session.user?.sections ?? [];
    if (!sections.includes("reports_sales") || !sections.includes("reports_purchases")) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [salesSort, setSalesSort] = useState<SortOption>("newest");
  const [purchasesSort, setPurchasesSort] = useState<SortOption>("newest");
  const [exporting, setExporting] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesShowAll, setSalesShowAll] = useState(false);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesShowAll, setPurchasesShowAll] = useState(false);

  const qs = new URLSearchParams();
  if (startDate) qs.set("from", startDate);
  if (endDate) qs.set("to", endDate);
  const { data: report, loading, error } = useFetch<EwayBillReport>(`/api/reports/eway-bill?${qs.toString()}`);
  // Pagination's `loading` prop means "already have data, refetching a page/filter change" (shows
  // a small dimming spinner) — passing the raw `loading` instead made it also fire during the very
  // first load, before `report` exists, when the table skeleton is already showing: Pagination's
  // FloatingSpinner (portaled to the viewport) then appeared as an unwanted full-page overlay on
  // top of the skeleton. See products/page.tsx's isRefetching for the reference pattern.
  const isRefetching = loading && !!report;

  // Reset each table back to page 1 whenever its own sort (or the shared date filter) changes —
  // adjusted during render (React's documented pattern for this) rather than in an effect, so it
  // takes effect in the same render pass.
  const salesFilterKey = `${startDate}|${endDate}|${salesSort}`;
  const [prevSalesFilterKey, setPrevSalesFilterKey] = useState(salesFilterKey);
  if (salesFilterKey !== prevSalesFilterKey) {
    setPrevSalesFilterKey(salesFilterKey);
    setSalesPage(1);
  }
  const purchasesFilterKey = `${startDate}|${endDate}|${purchasesSort}`;
  const [prevPurchasesFilterKey, setPrevPurchasesFilterKey] = useState(purchasesFilterKey);
  if (purchasesFilterKey !== prevPurchasesFilterKey) {
    setPrevPurchasesFilterKey(purchasesFilterKey);
    setPurchasesPage(1);
  }

  const sortedSales = sortRows(report?.sales ?? [], salesSort, (r) => r.date, (r) => r.total);
  const sortedPurchases = sortRows(report?.purchases ?? [], purchasesSort, (r) => r.billDate, (r) => r.total);
  const { visible: visibleSales } = usePagination(sortedSales, salesPage, salesShowAll);
  const { visible: visiblePurchases } = usePagination(sortedPurchases, purchasesPage, purchasesShowAll);

  async function handleExportExcel() {
    if (!report) return;
    setExporting(true);
    try {
      const rows = [
        ...sortedSales.map((r) => ["Sales", r.invoiceNumber, new Date(r.date).toLocaleDateString("en-IN"), r.customerName, r.placeOfSupply || "", r.isInterState ? "Inter-State" : "Intra-State", r.total]),
        ...sortedPurchases.map((r) => ["Purchase", r.billNumber, new Date(r.billDate).toLocaleDateString("en-IN"), r.vendorName, r.placeOfSupply || "", r.isInterState ? "Inter-State" : "Intra-State", r.total]),
      ];
      await downloadXlsx("Eway-Bill-Eligibility", "E-way Bill", ["Type", "Doc No.", "Date", "Party", "Place of Supply", "Movement", "Value"], rows);
    } catch {
      toast({ type: "error", title: "Failed", message: "Could not export Excel." });
    } finally {
      setExporting(false);
    }
  }

  const todayS = todayStr();

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      <div {...animateSection(0, "card")}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>E-way Bill Eligibility</h2>
            <p className={styles.subText}>
              Invoices/bills ≥ {fmt(report?.threshold ?? 50000)} — may need an E-way Bill. Rules vary by state; verify before relying on this list.
            </p>
          </div>
          <HeaderActionsRow>
            <Button variant="secondary" size="sm" onClick={handleExportExcel} loading={exporting} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="17"/><line x1="15" y1="13" x2="9" y2="17"/></svg>
              Export Excel
            </Button>
          </HeaderActionsRow>
        </div>
        <DateRangeFilter
          startDate={startDate} endDate={endDate} todayStr={todayS}
          onStartChange={setStartDate} onEndChange={setEndDate}
          onClear={() => { setStartDate(""); setEndDate(""); }}
        />
      </div>

      {error && (
        <div className={`card ${styles.errorCard}`}>Could not load the E-way Bill report.</div>
      )}

      <div {...animateSection(1, "card")}>
        <div className={styles.tableSectionHeader}>
          <h3 className={styles.tableSectionTitle}>Sales Invoices ({loading ? "…" : report?.sales.length ?? 0})</h3>
          <div className={styles.tableSectionActions}>
            <SortSelect value={salesSort} onChange={setSalesSort} options={SORT_OPTIONS} ariaLabel="Sort sales invoices" />
            <ShowAllToggle total={report?.sales.length ?? 0} showAll={salesShowAll} onToggle={() => setSalesShowAll((v) => !v)} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice No.</th><th>Date</th><th>Customer</th><th>Place of Supply</th><th>Movement</th><th className="table-th-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={ROW_COLUMNS} rows={4} />
              ) : visibleSales.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyCell}>No qualifying invoices in this period.</td></tr>
              ) : visibleSales.map((r) => (
                <tr key={r.id}>
                  <td data-mobile-full><Link href={`/sales/invoices/${r.id}`} className={styles.docLink}>{r.invoiceNumber}</Link></td>
                  <td data-label="Date">{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td data-label="Customer">{r.customerName}</td>
                  <td data-label="Place of Supply">{r.placeOfSupply || "—"}</td>
                  <td data-label="Movement">{r.isInterState ? "Inter-State" : "Intra-State"}</td>
                  <td data-label="Value" className="table-td-right">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={report?.sales.length ?? 0} page={salesPage} showAll={salesShowAll} onPage={setSalesPage} label="invoices" loading={isRefetching} />
      </div>

      <div {...animateSection(2, "card")}>
        <div className={styles.tableSectionHeader}>
          <h3 className={styles.tableSectionTitle}>Purchase Bills ({loading ? "…" : report?.purchases.length ?? 0})</h3>
          <div className={styles.tableSectionActions}>
            <SortSelect value={purchasesSort} onChange={setPurchasesSort} options={SORT_OPTIONS} ariaLabel="Sort purchase bills" />
            <ShowAllToggle total={report?.purchases.length ?? 0} showAll={purchasesShowAll} onToggle={() => setPurchasesShowAll((v) => !v)} />
          </div>
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Bill No.</th><th>Date</th><th>Vendor</th><th>Place of Supply</th><th>Movement</th><th className="table-th-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={ROW_COLUMNS} rows={4} />
              ) : visiblePurchases.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyCell}>No qualifying bills in this period.</td></tr>
              ) : visiblePurchases.map((r) => (
                <tr key={r.id}>
                  <td data-mobile-full><Link href={`/purchases/bills/${r.id}`} className={styles.docLink}>{r.billNumber}</Link></td>
                  <td data-label="Date">{new Date(r.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td data-label="Vendor">{r.vendorName}</td>
                  <td data-label="Place of Supply">{r.placeOfSupply || "—"}</td>
                  <td data-label="Movement">{r.isInterState ? "Inter-State" : "Intra-State"}</td>
                  <td data-label="Value" className="table-td-right">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={report?.purchases.length ?? 0} page={purchasesPage} showAll={purchasesShowAll} onPage={setPurchasesPage} label="bills" loading={isRefetching} />
      </div>
    </div>
  );
}
