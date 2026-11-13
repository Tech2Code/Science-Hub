"use client";

import { pdfFileName } from "@/lib/fileName";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, PAGE_SIZE } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { ListPeriodFilter } from "@/components/ui/ListPeriodFilter";
import { periodLabel as fmtPeriodLabel } from "@/components/dashboard/PeriodFilter";
import { useListPeriod, setPeriodParams } from "@/lib/listPeriod";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SearchField } from "@/components/ui/SearchField";
import { Button } from "@/components/ui/Button";
import { HeaderActionsRow } from "@/components/ui/HeaderActionsRow";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/formatDate";
import { useFetch } from "@/lib/useCache";
import { generatePdfViaIframe } from "@/lib/pdfIframeGenerator";
import { withCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { Cell, type Column } from "@/components/ui/Table";
import { StatCardsRow } from "@/components/ui/StatCardsRow";
import { animateSection } from "@/lib/animateSection";
import { downloadXlsx } from "@/lib/downloadXlsx";
import styles from "./creditNotes.module.css";

interface CreditNote {
  id: string;
  creditNoteNumber: string | null;
  date: string;
  subtotal: number; cgst: number; sgst: number; igst: number; total: number;
  _count: { items: number };
  invoiceId: string;
  invoice: { invoiceNumber: string; customer: { name: string; updatedAt?: string } };
  createdBy: string | null;
}

interface CreditNoteListResponse {
  data: CreditNote[];
  total: number;
}

interface CreditNoteStats {
  totalCreditNotes: number;
  totalCredited: number;
  periodCount: number;
  periodCredited: number;
  availableYears: number[];
}

interface BusinessSettings {
  showLogoOnInvoices?: boolean;
  updatedAt?: string;
}

type SortOption = "newest" | "oldest" | "amount_high" | "amount_low" | "customer_az" | "customer_za";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest",      label: "Newest first" },
  { value: "oldest",      label: "Oldest first" },
  { value: "amount_high", label: "Amount (High–Low)" },
  { value: "amount_low",  label: "Amount (Low–High)" },
  { value: "customer_az", label: "Customer (A–Z)" },
  { value: "customer_za", label: "Customer (Z–A)" },
];

const COLUMNS: Column[] = [
  { label: "Date",            mobile: "label" },
  { label: "Credit Note No.", mobile: "label" },
  { label: "Customer",        mobile: "label" },
  { label: "Invoice",         mobile: "label" },
  { label: "Items",           mobile: "full+label" },
  { label: "Amount",          cls: "table-th-right", mobile: "full+label" },
  { label: "Created By",      mobile: "label" },
  { label: "Actions",         mobile: "full+label" },
];

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditNotesPage() {
  const toast = useToast();

  const { data: settings } = useFetch<BusinessSettings>("/api/settings");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useListPeriod();
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  // View and Download are independent actions — each gets its own busy-lock
  // and loading id, so clicking one never shows the other as busy.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const viewBusyRef = useRef(false);
  const downloadBusyRef = useRef(false);
  const regenerateBusyRef = useRef(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewNote, setPdfPreviewNote] = useState<{ number: string; customer: string } | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = showAll ? 5000 : PAGE_SIZE;

  const listParams = new URLSearchParams();
  if (debouncedSearch.trim()) listParams.set("search", debouncedSearch.trim());
  // An active search looks across every year, so a credit note is findable whatever period is selected.
  setPeriodParams(listParams, period, !!debouncedSearch.trim());
  listParams.set("sort", sort);
  listParams.set("page", String(page));
  listParams.set("pageSize", String(pageSize));
  const apiUrl = `/api/credit-notes?${listParams.toString()}`;

  const statsParams = new URLSearchParams();
  setPeriodParams(statsParams, period);
  const statsUrl = `/api/credit-notes/stats?${statsParams.toString()}`;

  const { data, loading, error, mutate } = useFetch<CreditNoteListResponse>(apiUrl);
  const { data: stats } = useFetch<CreditNoteStats>(statsUrl);
  const creditNotes = data?.data ?? [];
  const total = data?.total ?? 0;
  const showSkeleton = loading && !data;
  const isRefetching = loading && !!data;

  const totalCreditNotes = stats?.totalCreditNotes ?? 0;
  const totalCredited    = stats?.totalCredited ?? 0;
  const periodCount       = stats?.periodCount ?? 0;
  const periodCredited    = stats?.periodCredited ?? 0;

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  async function exportCsv() {
    setExportingCsv(true);
    try {
      const exportParams = new URLSearchParams(listParams);
      exportParams.set("page", "1");
      exportParams.set("pageSize", "5000");
      const res = await fetch(`/api/credit-notes?${exportParams.toString()}`);
      const exportData: CreditNoteListResponse = await res.json();
      await downloadXlsx(
        "credit-notes.xlsx",
        "Credit Notes",
        ["Date", "Credit Note No.", "Customer", "Invoice", "Taxable Value", "CGST", "SGST", "IGST", "Total"],
        exportData.data.map(c => [
          formatDate(c.date),
          c.creditNoteNumber ?? "—", c.invoice.customer.name, c.invoice.invoiceNumber,
          c.subtotal, c.cgst, c.sgst, c.igst, c.total,
        ])
      );
    } catch {
      toast({ type: "error", title: "Export failed", message: "Could not generate the Excel file." });
    } finally {
      setExportingCsv(false);
    }
  }

  function closePdfPreview() {
    setPdfPreviewUrl(null);
    setPdfPreviewNote(null);
  }

  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  const anyPdfBusy = () => viewBusyRef.current || downloadBusyRef.current || regenerateBusyRef.current;

  // Line items never change after creation, so the PDF is cached by return id + a variant key over the only
  // things that still can change (settings, customer) — regenerated only when those change or the note is deleted.
  async function getOrRenderCreditNotePdf(c: CreditNote, force = false): Promise<Blob | null> {
    const showLogo = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(undefined, {
      logo: showLogo,
      settings: settings?.updatedAt ?? "loading",
      customer: c.invoice?.customer?.updatedAt ?? "loading",
    });
    return withCachedPdf(
      "return", c.id, variantKey,
      () => generatePdfViaIframe({
        route: `/sales/invoices/${c.invoiceId}?creditNoteId=${c.id}`,
        printAreaId: "credit-note-print-area",
        includeLogo: true,
      }),
      force,
    );
  }

  async function handleViewPdf(c: CreditNote) {
    if (anyPdfBusy()) return;
    viewBusyRef.current = true;
    setViewingId(c.id);
    try {
      const blob = await getOrRenderCreditNotePdf(c);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setPdfPreviewNote({ number: c.creditNoteNumber ?? "Credit Note", customer: c.invoice?.customer?.name ?? "" });
      } else {
        toast({ type: "error", title: "PDF failed", message: "Could not generate credit note PDF." });
      }
    } finally {
      setViewingId(null);
      viewBusyRef.current = false;
    }
  }

  // Bypasses the cache — re-renders and overwrites the stored variant so the fresh PDF is confirmed immediately.
  async function handleRegeneratePdf(c: CreditNote) {
    if (anyPdfBusy()) return;
    regenerateBusyRef.current = true;
    setRegeneratingId(c.id);
    try {
      const blob = await getOrRenderCreditNotePdf(c, true);
      if (!blob) {
        toast({ type: "error", title: "PDF failed", message: "Could not regenerate credit note PDF." });
        return;
      }
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewNote({ number: c.creditNoteNumber ?? "Credit Note", customer: c.invoice?.customer?.name ?? "" });
      toast({ type: "success", title: "PDF regenerated", message: "Latest version cached and shown below." });
    } finally {
      setRegeneratingId(null);
      regenerateBusyRef.current = false;
    }
  }

  async function handleDownloadPdf(c: CreditNote) {
    if (anyPdfBusy()) return;
    downloadBusyRef.current = true;
    setDownloadingId(c.id);
    try {
      const blob = await getOrRenderCreditNotePdf(c);
      if (!blob) {
        toast({ type: "error", title: "PDF failed", message: "Could not generate credit note PDF." });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = pdfFileName(c.creditNoteNumber ?? "Credit-Note");
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setDownloadingId(null);
      downloadBusyRef.current = false;
    }
  }

  return (
    <>
      {viewingId && <OverlayLoader text="Preparing preview…" />}
      {downloadingId && <OverlayLoader text="Preparing download…" />}
      {regeneratingId && <OverlayLoader text="Regenerating PDF…" />}
      {exportingCsv && <OverlayLoader text="Generating Excel file…" />}
      {pdfPreviewUrl && pdfPreviewNote && (
        <PdfPreviewModal
          url={pdfPreviewUrl}
          fileName={pdfPreviewNote.number}
          title={pdfPreviewNote.number}
          subtitle={pdfPreviewNote.customer}
          onClose={closePdfPreview}
        />
      )}
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Credit Notes</h1>
            <p className="page-sub">
              {showSkeleton ? "Loading…" : `${total} credit note${total === 1 ? "" : "s"} · ${debouncedSearch.trim() ? "Search" : fmtPeriodLabel(period)}`}
            </p>
          </div>
        </div>

        {/* Dashboard cards */}
        {(() => {
          const pLabel = fmtPeriodLabel(period);
          return (
            <StatCardsRow
              sectionIndex={0}
              loading={loading}
              cards={[
                { label: `Notes (${pLabel})`,        value: String(periodCount),         tone: "default" },
                { label: `Credited (${pLabel})`,     value: `₹${fmt(periodCredited)}`,   tone: "warning" },
                { label: "Total Notes (All Time)",    value: String(totalCreditNotes),    tone: "default" },
                { label: "Total Credited (All Time)", value: `₹${fmt(totalCredited)}`,    tone: "warning" },
              ]}
            />
          );
        })()}

        <div {...animateSection(1, "card")}>
          <div className="card-toolbar">
            <div className="toolbar-left">
              <SearchField
                aria-label="Search credit notes"
                placeholder="Search by customer, invoice no, or credit note no…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className={styles.searchInput}
              />
              <SortSelect ariaLabel="Sort credit notes" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
              <ListPeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} countScope="credit-notes" />
            </div>
            <HeaderActionsRow>
              {data && total > 0 && (
                <Button variant="secondary" size="sm" loading={exportingCsv} onClick={exportCsv}>Export Excel</Button>
              )}
              {data && (
                <ShowAllToggle total={total} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
              )}
            </HeaderActionsRow>
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
                ) : error ? (
                  <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                    <span style={{ color: "var(--c-red-text)" }}>Couldn&apos;t load credit notes.</span>{" "}
                    <Button size="sm" variant="secondary" onClick={() => mutate()}>Retry</Button>
                  </td></tr>
                ) : creditNotes.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                    {search ? "No credit notes match your search." : "No credit notes found for this period."}
                  </td></tr>
                ) : creditNotes.map((c) => (
                  <tr key={c.id}>
                    <Cell col={COLUMNS[0]} className={styles.dateCell}>
                      {formatDate(c.date)}
                    </Cell>
                    <Cell col={COLUMNS[1]} className={styles.creditNoteNumberCell}>{c.creditNoteNumber ?? "—"}</Cell>
                    <Cell col={COLUMNS[2]} className={styles.customerCell}>{c.invoice?.customer?.name}</Cell>
                    <Cell col={COLUMNS[3]}>
                      <Link href={`/sales/invoices/${c.invoiceId}`} className={styles.invoiceLink}>
                        {c.invoice?.invoiceNumber}
                      </Link>
                    </Cell>
                    <Cell col={COLUMNS[4]}>{c._count.items} item{c._count.items !== 1 ? "s" : ""}</Cell>
                    <Cell col={COLUMNS[5]} className={styles.amountCell}>₹{fmt(c.total)}</Cell>
                    <Cell col={COLUMNS[6]} className={styles.customerCell}>{c.createdBy ?? "—"}</Cell>
                    <Cell col={COLUMNS[7]}>
                      <div className="table-actions">
                        <Button variant="viewOutline" size="sm" loading={viewingId === c.id} disabled={viewingId !== null || downloadingId !== null || regeneratingId !== null} onClick={() => handleViewPdf(c)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          View
                        </Button>
                        <Button variant="secondary" size="sm" title="Download PDF" loading={downloadingId === c.id} disabled={viewingId !== null || downloadingId !== null || regeneratingId !== null} onClick={() => handleDownloadPdf(c)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          PDF
                        </Button>
                        <Button variant="secondary" size="sm" title="Regenerate PDF (bypass cache)" aria-label="Regenerate PDF" loading={regeneratingId === c.id} disabled={viewingId !== null || downloadingId !== null || regeneratingId !== null} onClick={() => handleRegeneratePdf(c)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                        </Button>
                      </div>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination
              total={total}
              page={page}
              showAll={showAll}
              onPage={setPage}
              label="credit notes"
              loading={isRefetching}
            />
          )}
        </div>
      </div>
    </>
  );
}
