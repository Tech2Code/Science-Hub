"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useFetch } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import styles from "./billsList.module.css";

interface PurchaseBill {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  status: string;
  total: number;
  paidAmount: number;
  category: string | null;
  vendor: { id: string; name: string; company: string | null };
  createdBy: { id: string; name: string };
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid" | "cancelled";
const STATUS_TABS: StatusFilter[] = ["All", "unpaid", "partial", "paid", "cancelled"];

const COLUMNS: Column[] = [
  { label: "Bill No.",  mobile: "full+label" },
  { label: "Date",      mobile: "label" },
  { label: "Vendor",    mobile: "label" },
  { label: "Category",  mobile: "label" },
  { label: "Total",     cls: "table-th-right", mobile: "label" },
  { label: "Paid",      cls: "table-th-right", mobile: "label" },
  { label: "Balance",   cls: "table-th-right", mobile: "label" },
  { label: "Status",    mobile: "full+label" },
  { label: "Actions",   mobile: "full+label" },
];

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

export default function PurchasesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseBill | null>(null);
  const toast = useToast();

  const apiUrl = filter === "All" ? "/api/purchase-bills" : `/api/purchase-bills?status=${filter}`;
  const { data, loading, patchData } = useFetch<PurchaseBill[]>(apiUrl);
  const bills = data ?? [];

  const filtered = search.trim()
    ? bills.filter(b => {
        const q = search.toLowerCase();
        return (
          b.billNumber.toLowerCase().includes(q) ||
          b.vendor.name.toLowerCase().includes(q) ||
          (b.vendor.company ?? "").toLowerCase().includes(q) ||
          (b.category ?? "").toLowerCase().includes(q) ||
          b.createdBy.name.toLowerCase().includes(q)
        );
      })
    : bills;

  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, maxPage);
  const { visible } = usePagination(filtered, clampedPage, showAll);

  // Summary stats
  const totalPurchase = bills.reduce((s, b) => s + b.total, 0);
  const totalPaid     = bills.reduce((s, b) => s + b.paidAmount, 0);
  const totalPending  = totalPurchase - totalPaid;
  const overdue       = bills.filter(b => b.status !== "paid" && b.status !== "cancelled" && b.dueDate && new Date(b.dueDate) < new Date()).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const previous = bills;
    patchData((prev) => (prev ?? []).filter((b) => b.id !== target.id));
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/purchase-bills/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ type: "success", title: "Bill deleted", message: `${target.billNumber} removed.` });
      } else {
        patchData(() => previous);
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete bill." });
      }
    } catch {
      patchData(() => previous);
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
  }

  return (
    <>
    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete Purchase Bill"
      message={`Delete purchase bill ${deleteTarget?.billNumber}? This cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      onConfirm={handleDelete}
      onCancel={() => setDeleteTarget(null)}
    />

    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Bills</h1>
          <p className="page-sub">
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${bills.length} bills` : `${bills.length} bills`}
          </p>
        </div>
        <Button variant="primary" href="/purchases/bills/new">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Bill
        </Button>
      </div>

      {/* Dashboard cards */}
      {!loading && bills.length > 0 && (
        <div className={styles.statsGrid}>
          {[
            { label: "Total Purchase", value: `₹${fmt(totalPurchase)}`, cls: styles.statTotal },
            { label: "Paid",           value: `₹${fmt(totalPaid)}`,     cls: styles.statPaid },
            { label: "Pending",        value: `₹${fmt(totalPending)}`,  cls: styles.statPending },
            { label: "Overdue Bills",  value: String(overdue),          cls: overdue > 0 ? styles.statOverdueActive : styles.statOverdue },
          ].map(card => (
            <div key={card.label} className={`card ${styles.statCard}`}>
              <div className={styles.statLabel}>{card.label}</div>
              <div className={`${styles.statValue} ${card.cls}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="filter-tabs-row">
        <div className="filter-tabs">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setFilter(tab); setPage(1); }}
              className={["filter-tab", filter === tab ? "filter-tab-active" : ""].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-toolbar">
          <input
            type="search"
            aria-label="Search purchase bills"
            placeholder="Search by bill no., vendor, category or staff…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className={`search-input ${styles.searchInput}`}
          />
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll(v => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={COLUMNS.length} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search.trim() ? `No bills match "${search}".` : "No purchase bills yet."}
                </td></tr>
              ) : visible.map(b => (
                <tr key={b.id}>
                  <Cell col={COLUMNS[0]}>
                    <a href={`/purchases/bills/${b.id}`} className={styles.billLink}>{b.billNumber}</a>
                  </Cell>
                  <Cell col={COLUMNS[1]} className={styles.dateCell}>
                    {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {b.dueDate && new Date(b.dueDate) < new Date() && b.status !== "paid" && (
                      <div className={styles.overdueSub}>Overdue</div>
                    )}
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.vendorCell}>
                    {b.vendor.name}
                    {b.vendor.company && <div className={styles.vendorCompany}>{b.vendor.company}</div>}
                  </Cell>
                  <Cell col={COLUMNS[3]} className={styles.categoryCell}>
                    {b.category || <span className={styles.dash}>—</span>}
                  </Cell>
                  <Cell col={COLUMNS[4]} className={styles.totalCell}>₹{fmt(b.total)}</Cell>
                  <Cell col={COLUMNS[5]} className={styles.paidCell}>₹{fmt(b.paidAmount)}</Cell>
                  <Cell col={COLUMNS[6]} className={styles.balanceCell}>₹{fmt(b.total - b.paidAmount)}</Cell>
                  <Cell col={COLUMNS[7]}><StatusBadge status={b.status} /></Cell>
                  <Cell col={COLUMNS[8]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" href={`/purchases/bills/${b.id}`}>View</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(b)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                        Delete
                      </Button>
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination total={filtered.length} page={clampedPage} showAll={showAll} onPage={setPage} label="bills" />
        )}
      </div>
    </div>
    </>
  );
}
