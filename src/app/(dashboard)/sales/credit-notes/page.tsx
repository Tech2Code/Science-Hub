"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { SortSelect } from "@/components/ui/SortSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useFetch } from "@/lib/useCache";
import { generatePdfViaIframe } from "@/lib/pdfIframeGenerator";
import { getCachedPdf, setCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { Cell, type Column } from "@/components/ui/Table";
import { StatCardsRow } from "@/components/ui/StatCardsRow";
import { animateSection } from "@/lib/animateSection";
import { downloadXlsx } from "@/lib/downloadXlsx";
import styles from "./creditNotes.module.css";

interface CreditNote {
  id: string;
  creditNoteNumber: string | null;
  date: string;
  createdAt: string;
  subtotal: number; cgst: number; sgst: number; igst: number; total: number;
  items: { id: string; name: string; quantity: number }[];
  invoiceId: string;
  invoice: { invoiceNumber: string; customer: { name: string } };
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

// `date` is a calendar-date picked on the return form (no meaningful time —
// it always lands on the same midnight), so two credit notes recorded on the
// same date sort as ties on `date` alone. `createdAt` carries the real
// creation instant, so it breaks those ties and keeps same-day notes ordered
// by when they were actually recorded.
function compareByDateThenCreatedAt(a: CreditNote, b: CreditNote): number {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function sortCreditNotes(list: CreditNote[], sort: SortOption): CreditNote[] {
  const arr = [...list];
  switch (sort) {
    case "oldest":      return arr.sort((a, b) => compareByDateThenCreatedAt(a, b));
    case "amount_high": return arr.sort((a, b) => b.total - a.total);
    case "amount_low":  return arr.sort((a, b) => a.total - b.total);
    case "customer_az": return arr.sort((a, b) => (a.invoice?.customer?.name ?? "").localeCompare(b.invoice?.customer?.name ?? ""));
    case "customer_za": return arr.sort((a, b) => (b.invoice?.customer?.name ?? "").localeCompare(a.invoice?.customer?.name ?? ""));
    case "newest":
    default:            return arr.sort((a, b) => compareByDateThenCreatedAt(b, a));
  }
}

const COLUMNS: Column[] = [
  { label: "Date",            mobile: "label" },
  { label: "Credit Note No.", mobile: "label" },
  { label: "Customer",        mobile: "label" },
  { label: "Invoice",         mobile: "label" },
  { label: "Items",           mobile: "full+label" },
  { label: "Amount",          cls: "table-th-right", mobile: "full+label" },
  { label: "Actions",         mobile: "full+label" },
];

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditNotesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const toast = useToast();

  const { data, loading } = useFetch<CreditNote[]>("/api/credit-notes");
  const { data: settings } = useFetch<BusinessSettings>("/api/settings");
  const creditNotes = data ?? [];
  const [exportingCsv, setExportingCsv] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  // View and Download are independent actions — each gets its own busy-lock
  // and loading id, so clicking one never shows the other as busy.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const viewBusyRef = useRef(false);
  const downloadBusyRef = useRef(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewNote, setPdfPreviewNote] = useState<{ number: string; customer: string } | null>(null);

  const filtered = creditNotes.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const dateText = new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toLowerCase();
    const timeText = new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }).toLowerCase();
    return (
      (c.invoice?.customer?.name ?? "").toLowerCase().includes(q) ||
      (c.invoice?.invoiceNumber ?? "").toLowerCase().includes(q) ||
      (c.creditNoteNumber ?? "").toLowerCase().includes(q) ||
      dateText.includes(q) ||
      timeText.includes(q)
    );
  });

  const sorted = sortCreditNotes(filtered, sort);
  const { visible } = usePagination(sorted, page, showAll);
  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  const totalCredited = creditNotes.reduce((s, c) => s + c.total, 0);
  const now = new Date();
  const thisMonthNotes = creditNotes.filter((c) => {
    const d = new Date(c.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const thisMonthCredited = thisMonthNotes.reduce((s, c) => s + c.total, 0);

  async function exportCsv() {
    setExportingCsv(true);
    try {
      await downloadXlsx(
        "credit-notes.xlsx",
        "Credit Notes",
        ["Date", "Time", "Credit Note No.", "Customer", "Invoice", "Taxable Value", "CGST", "SGST", "IGST", "Total"],
        sorted.map(c => [
          new Date(c.date).toLocaleDateString("en-IN"),
          new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
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

  // A credit note is never edited after creation, so once rendered its PDF
  // is reused as-is (cached by return id + a variant key derived from the
  // business settings that could actually change its content) instead of
  // re-rendering through the iframe on every click — only regenerated when
  // settings change (different variant key) or the note itself is deleted
  // (cache invalidated from the invoice detail page's delete handler).
  async function getOrRenderCreditNotePdf(c: CreditNote): Promise<Blob | null> {
    const showLogo = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(undefined, { logo: showLogo, settings: settings?.updatedAt ?? "loading" });
    const cached = await getCachedPdf("return", c.id, variantKey);
    if (cached) return cached;

    const blob = await generatePdfViaIframe({
      route: `/sales/invoices/${c.invoiceId}?creditNoteId=${c.id}`,
      printAreaId: "credit-note-print-area",
      includeLogo: true,
    });
    if (blob) setCachedPdf("return", c.id, variantKey, blob);
    return blob;
  }

  async function handleViewPdf(c: CreditNote) {
    if (viewBusyRef.current) return;
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

  async function handleDownloadPdf(c: CreditNote) {
    if (downloadBusyRef.current) return;
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
      a.href = url; a.download = `${c.creditNoteNumber ?? "Credit-Note"}.pdf`;
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
              {loading ? "Loading…" : `${creditNotes.length} credit note(s)`}
            </p>
          </div>
        </div>

        {/* Dashboard cards */}
        {(loading || creditNotes.length > 0) && (
          <StatCardsRow
            sectionIndex={0}
            loading={loading}
            cards={[
              { label: "Total Credit Notes", value: String(creditNotes.length),        tone: "default" },
              { label: "Total Credited",     value: `₹${fmt(totalCredited)}`,          tone: "warning" },
              { label: "This Month",         value: String(thisMonthNotes.length),     tone: "default" },
              { label: "Credited This Month", value: `₹${fmt(thisMonthCredited)}`,      tone: "warning" },
            ]}
          />
        )}

        <div {...animateSection(1, "card")}>
          <div className="card-toolbar">
            <div className="toolbar-left">
              <Input
                type="search"
                aria-label="Search credit notes"
                placeholder="Search by customer, invoice no, or credit note no…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className={styles.searchInput}
              />
              <SortSelect ariaLabel="Sort credit notes" value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {!loading && isAdmin && creditNotes.length > 0 && (
                <Button variant="secondary" size="sm" loading={exportingCsv} onClick={exportCsv}>Export Excel</Button>
              )}
              {!loading && (
                <ShowAllToggle total={filtered.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
              )}
            </div>
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
                  <tr><td colSpan={COLUMNS.length} className={styles.emptyCell}>
                    {search ? "No credit notes match your search." : "No credit notes recorded yet."}
                  </td></tr>
                ) : visible.map((c) => (
                  <tr key={c.id}>
                    <Cell col={COLUMNS[0]} className={styles.dateCell}>
                      {new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      <div className={styles.timeText}>
                        {new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </Cell>
                    <Cell col={COLUMNS[1]} className={styles.creditNoteNumberCell}>{c.creditNoteNumber ?? "—"}</Cell>
                    <Cell col={COLUMNS[2]} className={styles.customerCell}>{c.invoice?.customer?.name}</Cell>
                    <Cell col={COLUMNS[3]}>
                      <Link href={`/sales/invoices/${c.invoiceId}`} className={styles.invoiceLink}>
                        {c.invoice?.invoiceNumber}
                      </Link>
                    </Cell>
                    <Cell col={COLUMNS[4]}>{c.items.length} item{c.items.length !== 1 ? "s" : ""}</Cell>
                    <Cell col={COLUMNS[5]} className={styles.amountCell}>₹{fmt(c.total)}</Cell>
                    <Cell col={COLUMNS[6]}>
                      <div className="table-actions">
                        <Button variant="viewOutline" size="sm" loading={viewingId === c.id} disabled={downloadingId === c.id} onClick={() => handleViewPdf(c)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          View
                        </Button>
                        <Button variant="secondary" size="sm" title="Download PDF" loading={downloadingId === c.id} disabled={viewingId === c.id} onClick={() => handleDownloadPdf(c)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          PDF
                        </Button>
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
              page={page}
              showAll={showAll}
              onPage={setPage}
              label="credit notes"
            />
          )}
        </div>
      </div>
    </>
  );
}
