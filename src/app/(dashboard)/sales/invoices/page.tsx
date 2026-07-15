"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { useFetch } from "@/lib/useCache";
import { generatePdfViaIframe as pdfIframeGenerate } from "@/lib/pdfIframeGenerator";
import { getCachedPdf, setCachedPdf, invalidateCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { PdfCopyDialog } from "@/components/dialogs/PdfCopyDialog";
import { StatCardsRow } from "@/components/ui/StatCardsRow";
import { StatusFilterTabs } from "@/components/ui/StatusFilterTabs";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import styles from "./invoicesList.module.css";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  createdAt: string;
  customer: { name: string };
  total: number;
  paidAmount: number;
  status: string;
  items: { name: string; product: { name: string; brand: { name: string } | null; category: { name: string } | null } | null }[];
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

function sortInvoices(list: Invoice[], sort: SortOption): Invoice[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":
      return arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "customer_az":
      return arr.sort((a, b) => (a.customer?.name ?? "").localeCompare(b.customer?.name ?? ""));
    case "customer_za":
      return arr.sort((a, b) => (b.customer?.name ?? "").localeCompare(a.customer?.name ?? ""));
    case "amount_high":
      return arr.sort((a, b) => b.total - a.total);
    case "amount_low":
      return arr.sort((a, b) => a.total - b.total);
    case "balance_high":
      return arr.sort((a, b) => (b.total - b.paidAmount) - (a.total - a.paidAmount));
    case "newest":
    default:
      return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

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
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
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
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [pdfDialogInvoice, setPdfDialogInvoice] = useState<Invoice | null>(null);
  const [pdfDialogLoading, setPdfDialogLoading] = useState(false);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  function closePdfPreview() {
    setPdfPreviewUrl(null);
    setPdfPreviewInvoice(null);
  }

  // Revokes the previous blob URL whenever it's replaced (including by a
  // second preview opened without closing the first) or on unmount —
  // covering cases closePdfPreview()'s own revoke doesn't.
  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  // Loads the invoice detail page into a hidden iframe to render its full
  // #invoice-print-area (which this list page doesn't have the data for) and
  // generates a PDF blob from it — optionally stamped with copy labels.
  // The iframe always renders the detail page in its default state (payment/
  // return history toggles off), so the cached variant key can assume those
  // flags are false without needing to inspect the loaded page.
  async function generatePdfViaIframe(invoiceId: string, copyLabels?: string[], force = false): Promise<Blob | null> {
    const variantKey = buildPdfVariantKey(copyLabels, { p: false, r: false });
    if (!force) {
      const cached = await getCachedPdf("invoice", invoiceId, variantKey);
      if (cached) return cached;
    }
    const blob = await pdfIframeGenerate({ route: `/sales/invoices/${invoiceId}`, printAreaId: "invoice-print-area", copyLabels, includeLogo: true });
    if (blob) setCachedPdf("invoice", invoiceId, variantKey, blob);
    return blob;
  }

  // Bypasses the cache and re-renders a fresh PDF for the "Regenerate" action
  // — for when something outside the invoice's own data changed (business
  // logo/settings) and the cached copy needs to be replaced.
  async function handleRegenerate(inv: Invoice) {
    if (pdfBusyRef.current) return;
    pdfBusyRef.current = true;
    setPdfLoading(inv.id);
    try {
      const blob = await generatePdfViaIframe(inv.id, ["ORIGINAL COPY", "DUPLICATE COPY"], true);
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
    const blob = await generatePdfViaIframe(pdfDialogInvoice.id, copyLabels);
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

  const apiUrl = filter === "All" || filter === "overdue" ? "/api/invoices" : `/api/invoices?status=${filter}`;
  const { data, loading, patchData } = useFetch<Invoice[]>(apiUrl);
  const invoices = data ?? [];
  const scoped = filter === "overdue" ? invoices.filter(isOverdue) : invoices;

  const filtered = search.trim()
    ? scoped.filter((inv) => {
        const q = search.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customer?.name?.toLowerCase().includes(q) ||
          inv.items?.some((i) =>
            i.name.toLowerCase().includes(q) ||
            i.product?.name?.toLowerCase().includes(q) ||
            i.product?.brand?.name?.toLowerCase().includes(q) ||
            i.product?.category?.name?.toLowerCase().includes(q)
          )
        );
      })
    : scoped;

  const sorted = sortInvoices(filtered, sort);

  const maxPage = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, maxPage);

  const { visible } = usePagination(sorted, clampedPage, showAll);

  // Summary stats
  const totalInvoiced = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid     = invoices.reduce((s, inv) => s + inv.paidAmount, 0);
  const totalPending  = totalInvoiced - totalPaid;
  const overdue       = invoices.filter(inv => inv.status !== "paid" && inv.dueDate && new Date(inv.dueDate) < new Date()).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeletingInvoice(true);
    try {
      const res = await fetch(`/api/invoices/${target.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        patchData((prev) => (prev ?? []).filter((inv) => inv.id !== target.id));
        invalidateCachedPdf("invoice", target.id);
        toast({ type: "success", title: "Moved to bin", message: `${target.invoiceNumber} moved to bin. You can restore it within 30 days.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete invoice." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    } finally {
      setDeletingInvoice(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
    <ConfirmDialog
      open={!!deleteTarget}
      title="Move to Bin"
      message={`Move invoice ${deleteTarget?.invoiceNumber} to bin? You can restore it within 30 days.`}
      confirmLabel="Move to Bin"
      variant="danger"
      loading={deletingInvoice}
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
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${scoped.length} invoices` : `${scoped.length} invoices`}
          </p>
        </div>
        <Button variant="primary" href="/sales/invoices/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
      </div>

      {/* Dashboard cards */}
      {(loading || invoices.length > 0) && (
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
      />

      <div {...animateSection(2, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <Input
              type="search"
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
          </div>
          {!loading && (
            <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
          )}
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                {COLUMNS.map(col => <th key={col.label} className={col.cls}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={COLUMNS.length} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="table-empty-cell">
                  {search.trim() ? `No invoices match "${search}".` : "No invoices found."}
                </td></tr>
              ) : visible.map((inv) => (
                <tr key={inv.id}>
                  <Cell col={COLUMNS[0]}>
                    <a href={`/sales/invoices/${inv.id}`} className={styles.invoiceLink}>
                      {inv.invoiceNumber}
                    </a>
                  </Cell>
                  <Cell col={COLUMNS[1]} className={styles.dateCell}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
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
                          const blob = await generatePdfViaIframe(inv.id, ["ORIGINAL COPY", "DUPLICATE COPY"]);
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
                      <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" loading={pdfLoading === inv.id} onClick={() => handleRegenerate(inv)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                      </Button>
                      {/* 3. Edit */}
                      <Button variant="editOutline" size="sm" onClick={() => { setOpeningEditId(inv.id); router.push(`/sales/invoices/edit/${inv.id}`); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
                      {/* 4. Delete */}
                      <Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(inv)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>Delete</Button>
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={clampedPage}
            showAll={showAll}
            onPage={setPage}
            label="invoices"
          />
        )}
      </div>
    </div>
    </>
  );
}
