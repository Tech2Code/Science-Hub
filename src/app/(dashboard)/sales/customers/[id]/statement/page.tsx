"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/dialogs/Modal";
import { rules, validate } from "@/lib/validation";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TableSkeleton, SkeletonSwap } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination } from "@/components/ui/Pagination";
import { OverlayLoader } from "@/components/ui/Spinner";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { SortSelect } from "@/components/ui/SortSelect";
import { StatementPrintArea, type StatementPrintRow } from "@/components/statements/StatementPrintArea";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { getCachedPdf, setCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { downloadXlsx } from "@/lib/downloadXlsx";
import { formatDate } from "@/lib/formatDate";
import { useFetch } from "@/lib/useCache";
import { useMenuA11y } from "@/lib/useMenuA11y";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import type { Column } from "@/components/ui/Table";
import styles from "./statement.module.css";

const ROW_COLUMNS: Column[] = [
  { label: "Date", mobile: "full" },
  { label: "Particulars", mobile: "label" },
  { label: "Debit", cls: "table-th-right", mobile: "label" },
  { label: "Credit", cls: "table-th-right", mobile: "label" },
  { label: "Balance", cls: "table-th-right", mobile: "label" },
];

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// running balance = invoice debit − (payment+credit note) credit — positive means the customer owes us.
const bal = (n: number) => `${fmt(Math.abs(n))} ${n < 0 ? "Advance" : "Due"}`;

interface Party { id: string; name: string; phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null; gstin: string | null; }
interface Statement {
  customer: Party;
  openingBalance: number; closingBalance: number; totalDebit: number; totalCredit: number;
  rows: StatementPrintRow[];
}

// A statement has no single `updatedAt` of its own (it's derived live from invoices/payments/credit
// notes) — so the PDF cache key is fingerprinted off the actual rendered numbers instead. Any
// underlying data change reflows into `rows`/the balances, which changes the hash, which misses the
// cache automatically — no manual invalidation call needed anywhere an invoice/payment is edited.
function fingerprintStatement(s: Statement): string {
  const json = JSON.stringify({ o: s.openingBalance, c: s.closingBalance, d: s.totalDebit, cr: s.totalCredit, rows: s.rows });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = (h * 33) ^ json.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [settings, setSettings] = useState<{ name?: string; address?: string; city?: string; state?: string; pincode?: string; phone?: string; email?: string; gstin?: string; logoUrl?: string; showLogoOnInvoices?: boolean; } | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [pdfRegenerating, setPdfRegenerating] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareDropStyle, setShareDropStyle] = useState<React.CSSProperties>({});
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  useMenuA11y(shareOpen, () => setShareOpen(false), shareMenuRef);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToError, setEmailToError] = useState<string | undefined>(undefined);
  const [sendingEmail, setSendingEmail] = useState(false);

  const qs = new URLSearchParams();
  if (startDate) qs.set("from", startDate);
  if (endDate) qs.set("to", endDate);
  const { data: statement, loading, error } = useFetch<Statement>(id ? `/api/customers/${id}/statement?${qs.toString()}` : null);

  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(() => {}); }, []);

  // Reset back to page 1 whenever the date filter changes — adjusted during render (React's documented
  // pattern for this) rather than in an effect, so it takes effect in the same render pass.
  const filterKey = `${startDate}|${endDate}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // Display-only ordering — the ledger's running `balance` is always computed chronologically
  // (buildLedger in statementQuery.ts), so reversing here for "Latest first" doesn't touch any math.
  const displayRows = sort === "newest" ? [...(statement?.rows ?? [])].reverse() : (statement?.rows ?? []);
  const { visible: visibleRows } = usePagination(displayRows, page, showAll);

  const periodLabel = startDate || endDate
    ? `${startDate ? new Date(startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Beginning"} – ${endDate ? new Date(endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Today"}`
    : "All Time";

  async function generateStatementPdfBlob(force = false): Promise<Blob | null> {
    if (!statement) return null;
    const variantKey = buildPdfVariantKey(undefined, {
      period: qs.toString() || "all",
      fp: fingerprintStatement(statement),
    });
    if (!force) {
      const cached = await getCachedPdf("statement", id, variantKey);
      if (cached) return cached;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const el = document.getElementById("statement-print-area");
    const blob = el ? await generateInvoicePdfBlob(el, { logoUrl: settings?.showLogoOnInvoices !== false ? settings?.logoUrl || undefined : undefined }) : null;
    if (blob) setCachedPdf("statement", id, variantKey, blob);
    return blob;
  }

  async function handleRegeneratePdf() {
    if (!statement) return;
    setPdfRegenerating(true);
    const blob = await generateStatementPdfBlob(true);
    setPdfRegenerating(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
    toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
  }

  async function handleViewPdf() {
    if (!statement) return;
    setViewingPdf(true);
    const blob = await generateStatementPdfBlob();
    setViewingPdf(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
  }

  async function handleDownloadPdf() {
    if (!statement) return;
    setDownloadingPdf(true);
    const blob = await generateStatementPdfBlob();
    setDownloadingPdf(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Statement-${statement.customer.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleExportExcel() {
    if (!statement) return;
    setExportingExcel(true);
    try {
      const rows = statement.rows.map((r) => [
        formatDate(r.date), r.label, r.debit || "", r.credit || "", bal(r.balance),
      ]);
      await downloadXlsx(`Statement-${statement.customer.name}`, "Statement", ["Date", "Particulars", "Debit", "Credit", "Balance"], rows);
    } catch {
      toast({ type: "error", title: "Failed", message: "Could not export Excel." });
    } finally {
      setExportingExcel(false);
    }
  }

  function parseEmailList(raw: string): string[] {
    return raw.split(",").map(e => e.trim()).filter(Boolean);
  }

  async function handleShare(channel: "native" | "whatsapp" | "email") {
    setShareOpen(false);
    if (!statement) return;
    const name = statement.customer.name;

    if (channel === "email") {
      setEmailTo(statement.customer.email ?? "");
      setEmailToError(undefined);
      setEmailModalOpen(true);
      return;
    }

    setShareLoading(true);
    const blob = await generateStatementPdfBlob();
    setShareLoading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const file = new File([blob], `Statement-${name}.pdf`, { type: "application/pdf" });

    const downloadPdf = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Statement-${name}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    if (channel === "native") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Statement — ${name}` });
        } else {
          downloadPdf();
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
      }
      return;
    }

    if (channel === "whatsapp") {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Statement — ${name}`, text: `Account statement for ${name}` });
        } catch (err) {
          if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
        }
      } else {
        toast({ type: "error", title: "Not supported", message: "File sharing is not supported on this browser." });
      }
      return;
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!statement) return;
    const emails = parseEmailList(emailTo);
    if (emails.length === 0) { setEmailToError("Enter at least one email address."); return; }
    if (emails.length > 10) { setEmailToError("You can send to at most 10 recipients at once."); return; }
    for (const addr of emails) {
      const err = validate(addr, rules.email());
      if (err) { setEmailToError(`"${addr}" is not a valid email address.`); return; }
    }
    setEmailToError(undefined);
    setSendingEmail(true);
    try {
      const blob = await generateStatementPdfBlob();
      if (!blob) {
        toast({ type: "error", title: "Failed", message: "Could not generate PDF." });
        setSendingEmail(false);
        return;
      }
      const formData = new FormData();
      formData.append("pdf", blob, `Statement-${statement.customer.name}.pdf`);
      formData.append("to", emails.join(","));
      formData.append("title", `Statement — ${statement.customer.name}`);
      const res = await fetch("/api/send-statement", { method: "POST", body: formData });
      if (res.ok) {
        toast({ type: "success", title: "Email sent", message: `Statement sent to ${emails.join(", ")}` });
        setEmailModalOpen(false);
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Email failed", message: d.error ?? "Could not send email." });
      }
    } catch {
      toast({ type: "error", title: "Email failed", message: "Network error. Could not send email." });
    }
    setSendingEmail(false);
  }

  if (!loading && (error || !statement))
    return <div className={`loading-center ${styles.errorCenter}`}>Could not load statement.</div>;

  return (
    <div className={`page-stack ${styles.pageStack}`}>
      {viewingPdf && <OverlayLoader text="Preparing PDF…" />}
      {downloadingPdf && <OverlayLoader text="Preparing PDF…" />}
      {pdfRegenerating && <OverlayLoader text="Regenerating PDF…" />}
      {exportingExcel && <OverlayLoader text="Generating Excel file…" />}
      {shareLoading && <OverlayLoader text="Preparing PDF…" />}
      {sendingEmail && <OverlayLoader text="Sending email…" />}
      {pdfPreviewUrl && (
        <PdfPreviewModal
          url={pdfPreviewUrl}
          fileName={`Statement-${statement?.customer.name.replace(/[^a-z0-9]+/gi, "-") ?? "Customer"}`}
          title={`Statement${statement ? ` — ${statement.customer.name}` : ""}`}
          onClose={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
        />
      )}
      <Modal
        open={emailModalOpen}
        title="Email Statement"
        onClose={() => { if (!sendingEmail) setEmailModalOpen(false); }}
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" disabled={sendingEmail} onClick={() => setEmailModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="statement-email-form" variant="primary" loading={sendingEmail} disabled={sendingEmail}>Send</Button>
          </>
        }
      >
        <form id="statement-email-form" onSubmit={handleSendEmail} noValidate>
          <FormField label="Recipient Email(s)" required error={emailToError} hint="Separate multiple addresses with commas.">
            <Input
              type="text"
              value={emailTo}
              onChange={(e) => { setEmailTo(e.target.value); setEmailToError(undefined); }}
              placeholder="customer@example.com, accounts@example.com"
              maxLength={1000}
              autoFocus
              disabled={sendingEmail}
            />
          </FormField>
        </form>
      </Modal>
      {statement && (
        <StatementPrintArea
          party={statement.customer}
          periodLabel={periodLabel}
          openingBalance={statement.openingBalance}
          closingBalance={statement.closingBalance}
          balanceLabel="Receivable"
          positiveLabel="Due"
          negativeLabel="Advance"
          rows={statement.rows}
          settings={settings}
        />
      )}
      <Breadcrumb items={statement ? [
        { label: "Customers", href: "/sales/customers" },
        { label: statement.customer.name, href: `/sales/customers/${id}` },
        { label: "Statement" },
      ] : [{ label: "Customers", href: "/sales/customers" }]} />

      <div {...animateSection(0, "card")}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Account Statement{statement ? ` — ${statement.customer.name}` : ""}</h2>
          <div className={styles.toolbarActions}>
            <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" onClick={handleRegeneratePdf} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
            </Button>
            <Button variant="viewOutline" size="sm" onClick={handleViewPdf} loading={viewingPdf} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              View PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadPdf} loading={downloadingPdf} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportExcel} loading={exportingExcel} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="17" /><line x1="15" y1="13" x2="9" y2="17" /></svg>
              Export Excel
            </Button>
            <div className={styles.shareWrap} ref={shareContainerRef}>
              <Button variant="secondary" size="sm" disabled={loading || shareLoading} aria-haspopup="menu" aria-expanded={shareOpen} onClick={() => {
                setShareOpen(o => {
                  const next = !o;
                  if (next && shareContainerRef.current) {
                    const rect = shareContainerRef.current.getBoundingClientRect();
                    const dropW = 240;
                    const viewW = window.innerWidth;
                    let right = viewW - rect.right;
                    if (viewW - right - dropW < 8) right = viewW - dropW - 8;
                    right = Math.max(8, right);
                    setShareDropStyle({ position: "fixed", top: rect.bottom + 8, right });
                  }
                  return next;
                });
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.shareIconMargin}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                Share PDF
              </Button>
              {shareOpen && typeof document !== "undefined" && createPortal(
                <>
                  <div className={styles.shareOverlay} onClick={() => setShareOpen(false)} />
                  <div className={styles.shareMenu} style={shareDropStyle} ref={shareMenuRef} role="menu" aria-label="Share PDF">
                    <div className={styles.shareMenuTitle}>Share PDF</div>
                    {([
                      typeof navigator !== "undefined" && "share" in navigator ? {
                        key: "native", label: "Share / Send File",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>,
                        color: "var(--c-blue)",
                      } : null,
                      {
                        key: "whatsapp", label: "WhatsApp",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>,
                        color: "#25d366",
                      },
                      {
                        key: "email", label: "Email",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
                        color: "var(--c-text-2)",
                      },
                    ] as const).filter(Boolean).map((opt) => (
                      <button
                        key={opt!.key}
                        role="menuitem"
                        onClick={() => handleShare(opt!.key as "native" | "whatsapp" | "email")}
                        className={styles.shareMenuItem}
                      >
                        <span className={styles.shareMenuItemIcon} style={{ color: opt!.color }}>{opt!.icon}</span>
                        {opt!.label}
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </div>
      </div>

      <div {...animateSection(1, styles.statsGrid)}>
        {[
          { label: "Opening Balance", value: loading ? "" : bal(statement!.openingBalance) },
          { label: "Total Debit",     value: loading ? "" : fmt(statement!.totalDebit) },
          { label: "Total Credit",    value: loading ? "" : fmt(statement!.totalCredit) },
          { label: "Closing Balance", value: loading ? "" : bal(statement!.closingBalance) },
        ].map((s) => (
          <div key={s.label} className={`card ${styles.cardPadSm}`}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statValue}><SkeletonSwap loading={loading} w={100} h={22}>{s.value}</SkeletonSwap></div>
          </div>
        ))}
      </div>

      <div {...animateSection(2, "card")}>
        <div className="card-toolbar">
          <div className="toolbar-left">
            <DateRangeFilter
              startDate={startDate} endDate={endDate} todayStr={todayStr}
              onStartChange={setStartDate} onEndChange={setEndDate}
              onClear={() => { setStartDate(""); setEndDate(""); }}
              inline
            />
            <SortSelect
              ariaLabel="Sort statement entries"
              value={sort}
              onChange={setSort}
              options={[
                { value: "oldest", label: "Oldest first" },
                { value: "newest", label: "Latest first" },
              ]}
            />
          </div>
          <ShowAllToggle total={statement?.rows.length ?? 0} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
        </div>
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th className="table-th-right">Debit</th>
                <th className="table-th-right">Credit</th>
                <th className="table-th-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={ROW_COLUMNS} rows={5} />
              ) : statement!.rows.length === 0 ? (
                <tr><td colSpan={5} className={styles.emptyCell}>No transactions in this period.</td></tr>
              ) : visibleRows.map((r, idx) => (
                <tr key={`${r.date}-${idx}`}>
                  <td data-mobile-full>{new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td data-label="Particulars">{r.label}</td>
                  <td data-label="Debit" className="table-td-right">{r.debit ? fmt(r.debit) : "—"}</td>
                  <td data-label="Credit" className="table-td-right">{r.credit ? fmt(r.credit) : "—"}</td>
                  <td data-label="Balance" className="table-td-right">{bal(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && (
          <Pagination total={statement?.rows.length ?? 0} page={page} showAll={showAll} onPage={setPage} label="entries" />
        )}
      </div>
    </div>
  );
}
