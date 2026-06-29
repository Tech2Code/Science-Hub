"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { Cell, type Column } from "@/components/ui/Table";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  customer: { name: string };
  createdBy?: { id: string; name: string };
  total: number;
  paidAmount: number;
  status: string;
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid";
const STATUS_TABS: StatusFilter[] = ["All", "unpaid", "partial", "paid"];

const COLUMNS: Column[] = [
  { label: "Invoice No.", mobile: "full+label" },
  { label: "Date",        mobile: "label" },
  { label: "Customer",    mobile: "label" },
  { label: "Created By",  mobile: "label" },
  { label: "Total",       cls: "table-th-right", mobile: "label" },
  { label: "Paid",        cls: "table-th-right", mobile: "label" },
  { label: "Balance",     cls: "table-th-right", mobile: "label" },
  { label: "Status",      mobile: "full+label" },
  { label: "Actions",     mobile: "full+label" },
];

export default function InvoicesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewInvoice, setPdfPreviewInvoice] = useState<{ number: string; customer: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  function closePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
    setPdfPreviewInvoice(null);
  }

  const apiUrl = filter === "All" ? "/api/invoices" : `/api/invoices?status=${filter}`;
  const { data, loading, mutate } = useFetch<Invoice[]>(apiUrl);
  const invoices = data ?? [];

  const filtered = search.trim()
    ? invoices.filter((inv) => {
        const q = search.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customer?.name?.toLowerCase().includes(q) ||
          inv.createdBy?.name?.toLowerCase().includes(q)
        );
      })
    : invoices;

  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, maxPage);

  const { visible } = usePagination(filtered, clampedPage, showAll);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        mutate();
        toast({ type: "success", title: "Moved to bin", message: `${deleteTarget.invoiceNumber} moved to bin. You can restore it within 30 days.` });
      } else {
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete invoice." });
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
      title="Move to Bin"
      message={`Move invoice ${deleteTarget?.invoiceNumber} to bin? You can restore it within 30 days.`}
      confirmLabel="Move to Bin"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => { if (!deleting) setDeleteTarget(null); }}
    />
    {pdfLoading && <OverlayLoader text="Preparing PDF…" />}

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
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${invoices.length} invoices` : `${invoices.length} invoices`}
          </p>
        </div>
        <Button variant="primary" href="/invoices/new"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Invoice</Button>
      </div>

      {/* Status filter tabs */}
      <div className="filter-tabs-row">
        <div className="filter-tabs">
          {STATUS_TABS.map((tab) => (
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
            placeholder="Search by invoice no., customer or staff name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="search-input"
            style={{ flex: 1 }}
          />
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
                <tr><td colSpan={COLUMNS.length} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search.trim() ? `No invoices match "${search}".` : "No invoices found."}
                </td></tr>
              ) : visible.map((inv) => (
                <tr key={inv.id}>
                  <Cell col={COLUMNS[0]}>
                    <a href={`/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                      {inv.invoiceNumber}
                    </a>
                  </Cell>
                  <Cell col={COLUMNS[1]} style={{ color: "var(--c-text-3)" }}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className="date-sub" style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </Cell>
                  <Cell col={COLUMNS[2]} className="table-cell-clip" style={{ color: "var(--c-text-2)", maxWidth: "10rem" }}>{inv.customer?.name}</Cell>
                  <Cell col={COLUMNS[3]} style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{inv.createdBy?.name ?? "—"}</Cell>
                  <Cell col={COLUMNS[4]} style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[5]} style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[6]} style={{ color: "var(--c-text)" }}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</Cell>
                  <Cell col={COLUMNS[7]}><StatusBadge status={inv.status} /></Cell>
                  <Cell col={COLUMNS[8]}>
                    <div className="table-actions" style={{ flexWrap: "wrap" }}>
                        {/* 1. View → opens PDF preview modal */}
                      <Button variant="viewOutline" size="sm" onClick={async () => {
                        if (pdfLoading) return;
                        setPdfLoading(inv.id);
                        const iframe = document.createElement("iframe");
                        Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
                        const cleanup = () => { try { document.body.removeChild(iframe); } catch {} setPdfLoading(null); };
                        const safetyTimer = setTimeout(cleanup, 45000);
                        iframe.onload = async () => {
                          const el = await new Promise<HTMLElement | null>(resolve => {
                            let tries = 0;
                            const check = () => {
                              const area = iframe.contentDocument?.getElementById("invoice-print-area");
                              if (area?.querySelector("tbody tr")) { resolve(area); return; }
                              if (++tries > 40) { resolve(null); return; }
                              setTimeout(check, 250);
                            };
                            setTimeout(check, 250);
                          });
                          if (!el) { clearTimeout(safetyTimer); cleanup(); return; }
                          await new Promise(r => setTimeout(r, 400));
                          try {
                            const blob = await generateInvoicePdfBlob(el);
                            if (blob) {
                              const url = URL.createObjectURL(blob);
                              setPdfPreviewUrl(url);
                              setPdfPreviewInvoice({ number: inv.invoiceNumber, customer: inv.customer?.name ?? "" });
                            } else {
                              toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
                            }
                          } catch {
                            toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
                          }
                          clearTimeout(safetyTimer); cleanup();
                        };
                        document.body.appendChild(iframe);
                        iframe.src = `/invoices/${inv.id}`;
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </Button>
                      {/* 2. PDF → direct download (secondary = filled bg, distinct from viewOutline) */}
                      <Button variant="secondary" size="sm" title="Download PDF" onClick={async () => {
                        if (pdfLoading) return;
                        setPdfLoading(inv.id);
                        const iframe = document.createElement("iframe");
                        Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
                        const cleanup = () => { try { document.body.removeChild(iframe); } catch {} setPdfLoading(null); };
                        const safetyTimer = setTimeout(cleanup, 45000);
                        iframe.onload = async () => {
                          const el = await new Promise<HTMLElement | null>(resolve => {
                            let tries = 0;
                            const check = () => {
                              const area = iframe.contentDocument?.getElementById("invoice-print-area");
                              if (area?.querySelector("tbody tr")) { resolve(area); return; }
                              if (++tries > 40) { resolve(null); return; }
                              setTimeout(check, 250);
                            };
                            setTimeout(check, 250);
                          });
                          if (!el) { clearTimeout(safetyTimer); cleanup(); return; }
                          await new Promise(r => setTimeout(r, 400));
                          try {
                            const blob = await generateInvoicePdfBlob(el);
                            if (blob) {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url; a.download = `${inv.invoiceNumber}.pdf`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              setTimeout(() => URL.revokeObjectURL(url), 5000);
                            } else {
                              toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
                            }
                          } catch {
                            toast({ type: "error", title: "PDF failed", message: "Could not generate PDF." });
                          }
                          clearTimeout(safetyTimer); cleanup();
                        };
                        document.body.appendChild(iframe);
                        iframe.src = `/invoices/${inv.id}`;
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF
                      </Button>
                      {/* 3. Edit */}
                      <Button variant="editOutline" size="sm" href={`/invoices/edit/${inv.id}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</Button>
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
