"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useFetch } from "@/lib/useCache";
import { generatePdfViaIframe as pdfIframeGenerate } from "@/lib/pdfIframeGenerator";
import { getCachedPdf, setCachedPdf, invalidateCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { Input } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Cell, type Column } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { MonthYearFilter } from "@/components/ui/MonthYearFilter";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { StatCardsRow } from "@/components/ui/StatCardsRow";
import { StatusFilterTabs } from "@/components/ui/StatusFilterTabs";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import { useRouter } from "next/navigation";
import styles from "./billsList.module.css";

interface PurchaseBill {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  createdAt: string;
  status: string;
  total: number;
  paidAmount: number;
  category: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  vendor: { id: string; name: string; company: string | null };
  createdBy: { id: string; name: string };
}

interface PurchaseBillListResponse {
  data: PurchaseBill[];
  total: number;
}

interface PurchaseBillStats {
  totalPurchase: number;
  totalPaid: number;
  totalPending: number;
  overdueCount: number;
  availableYears: number[];
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid" | "cancelled" | "overdue";
const STATUS_TABS: StatusFilter[] = ["All", "overdue", "unpaid", "partial", "paid", "cancelled"];

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
  const canWrite = useCanWrite();
  const router = useRouter();
  const [openingEdit, setOpeningEdit] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
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

  // Loads the bill detail page into a hidden iframe to render its full
  // #bill-print-area (which this list page doesn't have the data for) and
  // generates a PDF blob from it.
  async function generatePdfViaIframe(billId: string, force = false): Promise<Blob | null> {
    const variantKey = buildPdfVariantKey();
    if (!force) {
      const cached = await getCachedPdf("purchase-bill", billId, variantKey);
      if (cached) return cached;
    }
    const blob = await pdfIframeGenerate({ route: `/purchases/bills/${billId}`, printAreaId: "bill-print-area" });
    if (blob) setCachedPdf("purchase-bill", billId, variantKey, blob);
    return blob;
  }

  // Bypasses the cache and re-renders a fresh PDF for the "Regenerate" action.
  async function handleRegenerate(b: PurchaseBill) {
    if (pdfBusyRef.current) return;
    pdfBusyRef.current = true;
    setPdfLoading(b.id);
    try {
      const blob = await generatePdfViaIframe(b.id, true);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setPdfPreviewBill({ number: b.billNumber, vendor: b.vendor?.name ?? "" });
        toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
      } else {
        toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
      }
    } finally {
      setPdfLoading(null);
      pdfBusyRef.current = false;
    }
  }

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = showAll ? 2000 : PAGE_SIZE;

  const listParams = new URLSearchParams();
  if (filter !== "All") listParams.set("status", filter);
  if (debouncedSearch.trim()) listParams.set("search", debouncedSearch.trim());
  if (month) listParams.set("month", month);
  if (year) listParams.set("year", year);
  listParams.set("sort", sort);
  listParams.set("page", String(page));
  listParams.set("pageSize", String(pageSize));
  const apiUrl = `/api/purchase-bills?${listParams.toString()}`;

  const statsParams = new URLSearchParams();
  if (filter !== "All") statsParams.set("status", filter);
  if (month) statsParams.set("month", month);
  if (year) statsParams.set("year", year);
  const statsUrl = `/api/purchase-bills/stats?${statsParams.toString()}`;

  const { data, loading, mutate } = useFetch<PurchaseBillListResponse>(apiUrl);
  const { data: stats, mutate: mutateStats } = useFetch<PurchaseBillStats>(statsUrl);
  const bills = data?.data ?? [];
  const total = data?.total ?? 0;

  const totalPurchase = stats?.totalPurchase ?? 0;
  const totalPaid      = stats?.totalPaid ?? 0;
  const totalPending   = stats?.totalPending ?? 0;
  const overdue        = stats?.overdueCount ?? 0;
  const availableYears = stats?.availableYears ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-bills/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await Promise.all([mutate(), mutateStats()]);
        invalidateCachedPdf("purchase-bill", target.id);
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
    {openingEdit && <OverlayLoader text="Opening editor…" />}

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
            {loading ? "Loading…" : `${total} bill${total === 1 ? "" : "s"}`}
          </p>
        </div>
        {canWrite && (<Button variant="primary" href="/purchases/bills/new">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Bill
        </Button>)}
      </div>

      {/* Dashboard cards */}
      {(loading || totalPurchase > 0 || total > 0) && (
        <StatCardsRow
          sectionIndex={0}
          loading={loading}
          cards={[
            { label: "Total Purchase", value: `₹${fmt(totalPurchase)}`, tone: "default" },
            { label: "Paid",           value: `₹${fmt(totalPaid)}`,     tone: "positive" },
            { label: "Pending",        value: `₹${fmt(totalPending)}`,  tone: "warning" },
            { label: "Overdue Bills",  value: String(overdue),          tone: overdue > 0 ? "danger" : "muted" },
          ]}
        />
      )}

      {/* Status filter tabs */}
      <StatusFilterTabs
        sectionIndex={1}
        tabs={STATUS_TABS}
        value={filter}
        onChange={(tab) => { setFilter(tab); setPage(1); }}
      />

      <div {...animateSection(2, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
              aria-label="Search purchase bills"
              placeholder="Search by bill no., vendor, product, brand, category or staff…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className={`${styles.searchInput}`}
            />
            <SortSelect
              ariaLabel="Sort purchase bills"
              value={sort}
              onChange={(v) => { setSort(v); setPage(1); }}
              options={SORT_OPTIONS}
            />
            <MonthYearFilter
              month={month}
              year={year}
              years={availableYears}
              onMonthChange={(v) => { setMonth(v); setPage(1); }}
              onYearChange={(v) => { setYear(v); setPage(1); }}
            />
          </div>
          {!loading && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll(v => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>{COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={COLUMNS} />
              ) : bills.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                  {search.trim() ? `No bills match "${search}".` : (month || year) ? "No purchase bills found for this period." : "No purchase bills yet."}
                </td></tr>
              ) : bills.map(b => (
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
                    <div>{new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className={["date-sub", styles.dateSub].join(" ")}>
                      {new Date(b.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                    {b.dueDate && new Date(b.dueDate) < new Date() && b.status !== "paid" && (
                      <div className={styles.overdueSub}>Overdue</div>
                    )}
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.vendorCell}>
                    <div className={styles.vendorName} title={b.vendor.name}>{b.vendor.name}</div>
                    {b.vendor.company && <div className={styles.vendorCompany} title={b.vendor.company}>{b.vendor.company}</div>}
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
                      <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" loading={pdfLoading === b.id} onClick={() => handleRegenerate(b)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                      </Button>
                      {canWrite && (
                        <Button
                          variant="editOutline"
                          size="sm"
                          disabled={b.status === "paid" || b.status === "cancelled"}
                          title={b.status === "paid" || b.status === "cancelled" ? `Bill is ${b.status} — nothing left to edit` : undefined}
                          onClick={() => { setOpeningEdit(b.id); router.push(`/purchases/bills/${b.id}/edit`); }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </Button>
                      )}
                      {canWrite && (<Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(b)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                        Delete
                      </Button>)}
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 && (
          <Pagination total={total} page={page} showAll={showAll} onPage={setPage} label="bills" />
        )}
      </div>
    </div>
    </>
  );
}
