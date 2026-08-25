"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { MonthYearFilter } from "@/components/ui/MonthYearFilter";
import { SearchField } from "@/components/ui/SearchField";
import { useFetch } from "@/lib/useCache";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { generatePdfViaIframe as pdfIframeGenerate } from "@/lib/pdfIframeGenerator";
import { getCachedPdf, setCachedPdf, invalidateCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/formatDate";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { PdfCopyDialog } from "@/components/dialogs/PdfCopyDialog";
import { StatCardsRow } from "@/components/ui/StatCardsRow";
import { StatusFilterTabs } from "@/components/ui/StatusFilterTabs";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import { useCanWrite } from "@/lib/useCanWrite";
import styles from "./invoicesList.module.css";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  createdAt: string;
  customer: { name: string; updatedAt?: string };
  total: number;
  paidAmount: number;
  status: string;
}

interface InvoiceListResponse {
  data: Invoice[];
  total: number;
}

interface InvoiceStats {
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  overdueCount: number;
  availableYears: number[];
}

interface BusinessSettings {
  showLogoOnInvoices?: boolean;
  updatedAt?: string;
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid" | "overdue";
const STATUS_TABS: StatusFilter[] = ["All", "overdue", "unpaid", "partial", "paid"];

function isOverdue(inv: { status: string; dueDate: string | null }): boolean {
  return inv.status !== "paid" && !!inv.dueDate && new Date(inv.dueDate) < new Date();
}

type SortOption = "newest" | "oldest" | "customer_az" | "customer_za" | "amount_high" | "amount_low" | "balance_high";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "customer_az", label: "Customer (A–Z)" },
  { value: "customer_za", label: "Customer (Z–A)" },
  { value: "amount_high", label: "Amount (High–Low)" },
  { value: "amount_low", label: "Amount (Low–High)" },
  { value: "balance_high", label: "Balance Due (High–Low)" },
];

const COLUMNS: Column[] = [
  { label: "Invoice No.", mobile: "full+label" },
  { label: "Date",        mobile: "label" },
  { label: "Customer",    mobile: "label" },
  { label: "Total",       cls: "table-th-right", mobile: "label" },
  { label: "Paid",        cls: "table-th-right", mobile: "label" },
  { label: "Balance",     cls: "table-th-right", mobile: "label" },
  { label: "Status",      mobile: "full+label" },
  { label: "Actions",     mobile: "full+label" },
];

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InvoicesPage() {
  const canWrite = useCanWrite();
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  // Ref-based lock (synchronous, unlike React state) — guards against duplicate
  // touch+click event synthesis on mobile/touch devices firing the handler twice.
  const pdfBusyRef = useRef(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewInvoice, setPdfPreviewInvoice] = useState<{ number: string; customer: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pdfDialogInvoice, setPdfDialogInvoice] = useState<Invoice | null>(null);
  const [pdfDialogLoading, setPdfDialogLoading] = useState(false);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  function closePdfPreview() {
    setPdfPreviewUrl(null);
    setPdfPreviewInvoice(null);
  }

  // Revokes the previous blob URL on replace/unmount, covering cases closePdfPreview()'s own revoke doesn't.
  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  // Renders the invoice detail page's #invoice-print-area in a hidden iframe to build the PDF blob; the iframe
  // always loads in its default state (payment/return toggles off), so the variant key can assume those are false.
  async function generatePdfViaIframe(inv: Invoice, copyLabels?: string[], force = false): Promise<Blob | null> {
    const showLogoOnInvoices = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(copyLabels, {
      p: false,
      r: false,
      logo: showLogoOnInvoices,
      settings: settings?.updatedAt ?? "loading",
      customer: inv.customer?.updatedAt ?? "loading",
    });
    if (!force) {
      const cached = await getCachedPdf("invoice", inv.id, variantKey);
      if (cached) return cached;
    }
    const blob = await pdfIframeGenerate({ route: `/sales/invoices/${inv.id}`, printAreaId: "invoice-print-area", copyLabels, includeLogo: true });
    if (blob) setCachedPdf("invoice", inv.id, variantKey, blob);
    return blob;
  }

  // Bypasses the cache — for when something outside the invoice's own data (business logo/settings) changed.
  async function handleRegenerate(inv: Invoice) {
    if (pdfBusyRef.current) return;
    pdfBusyRef.current = true;
    setPdfLoading(inv.id);
    try {
      const blob = await generatePdfViaIframe(inv, ["ORIGINAL COPY"], true);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setPdfPreviewInvoice({ number: inv.invoiceNumber, customer: inv.customer?.name ?? "" });
        toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
      } else {
        toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
      }
    } finally {
      setPdfLoading(null);
      pdfBusyRef.current = false;
    }
  }

  async function handlePdfDialogConfirm(copyLabels: string[]) {
    if (!pdfDialogInvoice) return;
    setPdfDialogLoading(true);
    // Force a real paint before the (mostly synchronous) iframe setup + PDF
    // work runs, so the loading spinner is actually visible on screen.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const blob = await generatePdfViaIframe(pdfDialogInvoice, copyLabels);
    setPdfDialogLoading(false);
    if (!blob) {
      toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${pdfDialogInvoice.invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setPdfDialogInvoice(null);
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
  const apiUrl = `/api/invoices?${listParams.toString()}`;

  const statsParams = new URLSearchParams();
  if (filter !== "All") statsParams.set("status", filter);
  if (month) statsParams.set("month", month);
  if (year) statsParams.set("year", year);
  const statsUrl = `/api/invoices/stats?${statsParams.toString()}`;

  const { data, loading, mutate } = useFetch<InvoiceListResponse>(apiUrl);
  const { data: stats, mutate: mutateStats } = useFetch<InvoiceStats>(statsUrl);
  const { data: settings } = useFetch<BusinessSettings>("/api/settings");
  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const showSkeleton = loading && !data;
  const isRefetching = loading && !!data;

  const totalInvoiced = stats?.totalInvoiced ?? 0;
  const totalPaid     = stats?.totalPaid ?? 0;
  const totalPending  = stats?.totalPending ?? 0;
  const overdue       = stats?.overdueCount ?? 0;
  const availableYears = stats?.availableYears ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await Promise.all([mutate(), mutateStats()]);
        invalidateCachedPdf("invoice", target.id);
        toast({ type: "success", title: "Moved to bin", message: `${target.invoiceNumber} moved to bin. You can restore it within 30 days.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete invoice." });
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
      title="Delete Invoice"
      message={`Move invoice ${deleteTarget?.invoiceNumber} to bin? You can restore it within 30 days.`}
      confirmLabel="Move to Bin"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => setDeleteTarget(null)}
    />
    {pdfLoading && <OverlayLoader text="Preparing PDF…" />}
    {openingEditId && <OverlayLoader text="Opening editor…" />}

    <PdfCopyDialog
      open={!!pdfDialogInvoice}
      loading={pdfDialogLoading}
      onConfirm={handlePdfDialogConfirm}
      onCancel={() => { if (!pdfDialogLoading) setPdfDialogInvoice(null); }}
    />

    {pdfPreviewUrl && pdfPreviewInvoice && (
      <PdfPreviewModal
        url={pdfPreviewUrl}
        fileName={pdfPreviewInvoice.number}
        title={pdfPreviewInvoice.number}
        subtitle={pdfPreviewInvoice.customer}
        onClose={closePdfPreview}
      />
    )}

    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">
            {showSkeleton ? "Loading…" : `${total} invoice${total === 1 ? "" : "s"}`}
          </p>
        </div>
        {canWrite && (<Button variant="primary" href="/sales/invoices/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>)}
      </div>

      {/* Dashboard cards */}
      {(loading || totalInvoiced > 0 || total > 0) && (
        <StatCardsRow
          sectionIndex={0}
          loading={loading}
          cards={[
            { label: "Total Invoiced",   value: `₹${fmt(totalInvoiced)}`, tone: "default" },
            { label: "Paid",             value: `₹${fmt(totalPaid)}`,     tone: "positive" },
            { label: "Pending",          value: `₹${fmt(totalPending)}`,  tone: "warning" },
            { label: "Overdue Invoices", value: String(overdue),          tone: overdue > 0 ? "danger" : "muted" },
          ]}
        />
      )}

      {/* Status filter tabs */}
      <StatusFilterTabs
        sectionIndex={1}
        tabs={STATUS_TABS}
        value={filter}
        onChange={(tab) => { setFilter(tab); setPage(1); }}
        disabled={!data}
      />

      <div {...animateSection(2, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <SearchField
              aria-label="Search invoices"
              placeholder="Search by invoice no., customer, product, brand or category…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className={styles.searchInput}
            />
            <SortSelect
              ariaLabel="Sort invoices"
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
          {data && (
            <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base" style={isRefetching ? { opacity: 0.5, transition: "opacity 0.15s" } : undefined}>
            <thead>
              <tr>
                {COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {showSkeleton ? (
                <TableSkeleton columns={COLUMNS} />
              ) : invoices.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="table-empty-cell">
                  {search.trim() ? `No invoices match "${search}".` : (month || year) ? "No invoices found for this period." : "No invoices found."}
                </td></tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id}>
                  <Cell col={COLUMNS[0]}>
                    <a href={`/sales/invoices/${inv.id}`} className={styles.invoiceLink}>
                      {inv.invoiceNumber}
                    </a>
                  </Cell>
                  <Cell col={COLUMNS[1]} className={styles.dateCell}>
                    <div>{formatDate(inv.date)}</div>
                    <div className={["date-sub", styles.dateSub].join(" ")}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                    {isOverdue(inv) && <div className={styles.overdueSub}>Overdue</div>}
                  </Cell>
                  <Cell col={COLUMNS[2]} className={styles.customerCell}>{inv.customer?.name}</Cell>
                  <Cell col={COLUMNS[3]} className={styles.totalCell}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[4]} className={styles.paidCell}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[5]} className={styles.balanceCell}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[6]}><StatusBadge status={inv.status} /></Cell>
                  <Cell col={COLUMNS[7]}>
                    <div className={["table-actions", styles.actionsWrap].join(" ")}>
                        {/* 1. View → opens PDF preview modal (same on desktop and mobile) */}
                      <Button variant="viewOutline" size="sm" onClick={async () => {
                        if (pdfBusyRef.current) return;
                        pdfBusyRef.current = true;
                        setPdfLoading(inv.id);
                        try {
                          const blob = await generatePdfViaIframe(inv, ["ORIGINAL COPY"]);
                          if (blob) {
                            const url = URL.createObjectURL(blob);
                            setPdfPreviewUrl(url);
                            setPdfPreviewInvoice({ number: inv.invoiceNumber, customer: inv.customer?.name ?? "" });
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
                      {/* 2. PDF → opens copy-selection dialog (same on desktop and mobile) */}
                      <Button variant="secondary" size="sm" title="Download PDF" onClick={() => {
                        if (pdfBusyRef.current) return;
                        setPdfDialogInvoice(inv);
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF
                      </Button>
                      {/* 2b. Regenerate → discards the cached PDF and re-renders a fresh one */}
                      <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" onClick={() => handleRegenerate(inv)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                      </Button>
                      {/* 3. Edit */}
                      {canWrite && (
                        <Button
                          variant="editOutline" size="sm"
                          disabled={inv.status === "paid"}
                          title={inv.status === "paid" ? "Invoice is fully paid — nothing left to edit" : undefined}
                          onClick={() => { setOpeningEditId(inv.id); router.push(`/sales/invoices/${inv.id}/edit`); }}
                        ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
                      )}
                      {/* 4. Delete */}
                      {canWrite && (<Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(inv)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete</Button>)}
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && total > 0 && (
          <Pagination
            total={total}
            page={page}
            showAll={showAll}
            onPage={setPage}
            label="invoices"
            loading={isRefetching}
          />
        )}
      </div>
    </div>
    </>
  );
}
