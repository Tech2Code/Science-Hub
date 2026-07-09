"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useFetch } from "@/lib/useCache";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { OverlayLoader } from "@/components/ui/Spinner";
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
  attachmentUrl: string | null;
  attachmentName: string | null;
  vendor: { id: string; name: string; company: string | null };
  createdBy: { id: string; name: string };
  items: { name: string; product: { name: string; brand: { name: string } | null; category: { name: string } | null } | null }[];
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid" | "cancelled";
const STATUS_TABS: StatusFilter[] = ["All", "unpaid", "partial", "paid", "cancelled"];

type SortOption = "newest" | "oldest" | "vendor_az" | "vendor_za" | "amount_high" | "amount_low" | "balance_high";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "vendor_az", label: "Vendor (A–Z)" },
  { value: "vendor_za", label: "Vendor (Z–A)" },
  { value: "amount_high", label: "Amount (High–Low)" },
  { value: "amount_low", label: "Amount (Low–High)" },
  { value: "balance_high", label: "Balance Due (High–Low)" },
];

function sortBills(list: PurchaseBill[], sort: SortOption): PurchaseBill[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":
      return arr.sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime());
    case "vendor_az":
      return arr.sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
    case "vendor_za":
      return arr.sort((a, b) => b.vendor.name.localeCompare(a.vendor.name));
    case "amount_high":
      return arr.sort((a, b) => b.total - a.total);
    case "amount_low":
      return arr.sort((a, b) => a.total - b.total);
    case "balance_high":
      return arr.sort((a, b) => (b.total - b.paidAmount) - (a.total - a.paidAmount));
    case "newest":
    default:
      return arr.sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime());
  }
}

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

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchasesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseBill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  // Ref-based lock (synchronous, unlike React state) — guards against duplicate
  // touch+click event synthesis on mobile/touch devices firing the handler twice.
  const pdfBusyRef = useRef(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewBill, setPdfPreviewBill] = useState<{ number: string; vendor: string } | null>(null);
  const toast = useToast();

  function closePdfPreview() {
    setPdfPreviewUrl(null);
    setPdfPreviewBill(null);
  }

  // Revokes the previous blob URL whenever it's replaced (including by a
  // second preview opened without closing the first) or on unmount.
  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  // Loads the bill detail page into a hidden iframe (to render its full
  // #bill-print-area, which this list page doesn't have the data for) and
  // generates a PDF blob from it.
  function generatePdfViaIframe(billId: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
      const cleanup = () => { try { document.body.removeChild(iframe); } catch {} };
      const safetyTimer = setTimeout(() => { cleanup(); resolve(null); }, 45000);
      iframe.onload = async () => {
        const el = await new Promise<HTMLElement | null>(resolveEl => {
          let tries = 0;
          const check = () => {
            const area = iframe.contentDocument?.getElementById("bill-print-area");
            if (area?.querySelector("tbody tr")) { resolveEl(area); return; }
            if (++tries > 40) { resolveEl(null); return; }
            setTimeout(check, 250);
          };
          setTimeout(check, 250);
        });
        if (!el) { clearTimeout(safetyTimer); cleanup(); resolve(null); return; }
        await new Promise(r => setTimeout(r, 400));
        let blob: Blob | null = null;
        try {
          blob = await generateInvoicePdfBlob(el);
        } catch { /* resolved as null below */ }
        clearTimeout(safetyTimer); cleanup();
        resolve(blob);
      };
      document.body.appendChild(iframe);
      iframe.src = `/purchases/bills/${billId}`;
    });
  }

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
          b.createdBy.name.toLowerCase().includes(q) ||
          b.items.some((i) =>
            i.name.toLowerCase().includes(q) ||
            i.product?.name?.toLowerCase().includes(q) ||
            i.product?.brand?.name?.toLowerCase().includes(q) ||
            i.product?.category?.name?.toLowerCase().includes(q)
          )
        );
      })
    : bills;

  const sorted = sortBills(filtered, sort);

  const maxPage = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, maxPage);
  const { visible } = usePagination(sorted, clampedPage, showAll);

  // Summary stats
  const totalPurchase = bills.reduce((s, b) => s + b.total, 0);
  const totalPaid     = bills.reduce((s, b) => s + b.paidAmount, 0);
  const totalPending  = totalPurchase - totalPaid;
  const overdue       = bills.filter(b => b.status !== "paid" && b.status !== "cancelled" && b.dueDate && new Date(b.dueDate) < new Date()).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-bills/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        patchData((prev) => (prev ?? []).filter((b) => b.id !== target.id));
        toast({ type: "success", title: "Bill deleted", message: `${target.billNumber} removed.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete bill." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
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
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => setDeleteTarget(null)}
    />
    {pdfLoading && <OverlayLoader text="Preparing PDF…" />}

    {pdfPreviewUrl && pdfPreviewBill && (
      <PdfPreviewModal
        url={pdfPreviewUrl}
        fileName={pdfPreviewBill.number}
        title={pdfPreviewBill.number}
        subtitle={pdfPreviewBill.vendor}
        onClose={closePdfPreview}
      />
    )}

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
          <div className="toolbar-left">
            <input
              type="search"
              aria-label="Search purchase bills"
              placeholder="Search by bill no., vendor, product, brand, category or staff…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className={`search-input ${styles.searchInput}`}
            />
            <select
              aria-label="Sort purchase bills"
              value={sort}
              onChange={e => { setSort(e.target.value as SortOption); setPage(1); }}
              className={`search-input ${styles.sortSelect}`}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
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
                    {b.attachmentUrl && (
                      <a
                        href={b.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={b.attachmentName || "View attachment"}
                        className={styles.attachmentIconLink}
                        onClick={e => e.stopPropagation()}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                      </a>
                    )}
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
                      <Button variant="viewOutline" size="sm" onClick={async () => {
                        if (pdfBusyRef.current) return;
                        pdfBusyRef.current = true;
                        setPdfLoading(b.id);
                        try {
                          const blob = await generatePdfViaIframe(b.id);
                          if (blob) {
                            const url = URL.createObjectURL(blob);
                            setPdfPreviewUrl(url);
                            setPdfPreviewBill({ number: b.billNumber, vendor: b.vendor?.name ?? "" });
                          } else {
                            toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
                          }
                        } finally {
                          setPdfLoading(null);
                          pdfBusyRef.current = false;
                        }
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </Button>
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
