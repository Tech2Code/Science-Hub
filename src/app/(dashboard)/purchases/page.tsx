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
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const apiUrl = filter === "All" ? "/api/purchase-bills" : `/api/purchase-bills?status=${filter}`;
  const { data, loading, mutate } = useFetch<PurchaseBill[]>(apiUrl);
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
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-bills/${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        mutate();
        toast({ type: "success", title: "Bill deleted", message: `${deleteTarget.billNumber} removed.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete bill." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <>
    <ConfirmDialog
      open={!!deleteTarget}
      title="Delete Purchase Bill"
      message={`Delete purchase bill ${deleteTarget?.billNumber}? This cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => { if (!deleting) setDeleteTarget(null); }}
    />

    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Bills</h1>
          <p className="page-sub">
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${bills.length} bills` : `${bills.length} bills`}
          </p>
        </div>
        <Button variant="primary" href="/purchases/new">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Bill
        </Button>
      </div>

      {/* Dashboard cards */}
      {!loading && bills.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.875rem" }}>
          {[
            { label: "Total Purchase", value: `₹${fmt(totalPurchase)}`, color: "var(--c-text)" },
            { label: "Paid",           value: `₹${fmt(totalPaid)}`,     color: "var(--c-green-text)" },
            { label: "Pending",        value: `₹${fmt(totalPending)}`,  color: "var(--c-amber)" },
            { label: "Overdue Bills",  value: String(overdue),          color: overdue > 0 ? "var(--c-red)" : "var(--c-text-4)" },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--c-text-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: card.color, marginTop: "0.25rem" }}>{card.value}</div>
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
            placeholder="Search by bill no., vendor, category or staff…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="search-input"
            style={{ flex: 1 }}
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
                <tr><td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search.trim() ? `No bills match "${search}".` : "No purchase bills yet."}
                </td></tr>
              ) : visible.map(b => (
                <tr key={b.id}>
                  <Cell col={COLUMNS[0]}>
                    <a href={`/purchases/${b.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>{b.billNumber}</a>
                  </Cell>
                  <Cell col={COLUMNS[1]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                    {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {b.dueDate && new Date(b.dueDate) < new Date() && b.status !== "paid" && (
                      <div style={{ fontSize: "0.7rem", color: "var(--c-red)", fontWeight: 600, marginTop: 2 }}>Overdue</div>
                    )}
                  </Cell>
                  <Cell col={COLUMNS[2]} style={{ color: "var(--c-text-2)", fontWeight: 500 }}>
                    {b.vendor.name}
                    {b.vendor.company && <div style={{ fontSize: "0.75rem", color: "var(--c-text-4)" }}>{b.vendor.company}</div>}
                  </Cell>
                  <Cell col={COLUMNS[3]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>
                    {b.category || <span style={{ color: "var(--c-text-4)" }}>—</span>}
                  </Cell>
                  <Cell col={COLUMNS[4]} style={{ fontWeight: 500, textAlign: "right" }}>₹{fmt(b.total)}</Cell>
                  <Cell col={COLUMNS[5]} style={{ color: "var(--c-green-text)", textAlign: "right" }}>₹{fmt(b.paidAmount)}</Cell>
                  <Cell col={COLUMNS[6]} style={{ textAlign: "right" }}>₹{fmt(b.total - b.paidAmount)}</Cell>
                  <Cell col={COLUMNS[7]}><StatusBadge status={b.status} /></Cell>
                  <Cell col={COLUMNS[8]}>
                    <div className="table-actions">
                      <Button variant="viewOutline" size="sm" href={`/purchases/${b.id}`}>View</Button>
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
