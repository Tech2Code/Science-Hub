"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination, ShowAllToggle, usePagination, PAGE_SIZE } from "@/components/ui/Pagination";
import { useFetch } from "@/lib/useCache";
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

export default function InvoicesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

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

  useEffect(() => { setPage(1); }, [filter, search]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page]);

  const { visible } = usePagination(filtered, page, showAll);

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
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">
            {loading ? "Loading…" : search.trim() ? `${filtered.length} of ${invoices.length} invoices` : `${invoices.length} invoices`}
          </p>
        </div>
        <Button variant="primary" href="/invoices/new">+ New Invoice</Button>
      </div>

      {/* Status filter tabs */}
      <div className="filter-tabs-row">
        <div className="filter-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
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
            onChange={(e) => setSearch(e.target.value)}
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
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Created By</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={9} />
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  {search.trim() ? `No invoices match "${search}".` : "No invoices found."}
                </td></tr>
              ) : visible.map((inv) => (
                <tr key={inv.id}>
                  <td data-mobile-full>
                    <a href={`/invoices/${inv.id}`} style={{ fontWeight: 500, color: "var(--c-blue)", textDecoration: "none" }}>
                      {inv.invoiceNumber}
                    </a>
                  </td>
                  <td data-mobile-hide style={{ color: "var(--c-text-3)" }}>
                    <div>{new Date(inv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    <div className="date-sub" style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 2 }}>
                      {new Date(inv.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                  </td>
                  <td data-label="Customer" style={{ color: "var(--c-text-2)" }}>{inv.customer?.name}</td>
                  <td data-label="Created By" style={{ color: "var(--c-text-3)", fontSize: "0.8125rem" }}>{inv.createdBy?.name ?? "—"}</td>
                  <td data-label="Total" className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Balance" className="table-td-right" style={{ color: "var(--c-text)" }}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Status"><StatusBadge status={inv.status} /></td>
                  <td data-mobile-full>
                    <div className="table-actions" style={{ flexWrap: "wrap" }}>
                      <Button variant="viewOutline" size="sm" href={`/invoices/${inv.id}`}>View</Button>
                      <Button variant="editOutline" size="sm" href={`/invoices/edit/${inv.id}`}>Edit</Button>
                      <Button variant="viewOutline" size="sm" onClick={async () => {
                        if (pdfLoading) return;
                        setPdfLoading(inv.id);
                        const iframe = document.createElement("iframe");
                        Object.assign(iframe.style, { position: "fixed", width: "850px", height: "1200px", top: "-9999px", left: "-9999px", border: "none", opacity: "0", pointerEvents: "none" });
                        const cleanup = () => { try { document.body.removeChild(iframe); } catch {} setPdfLoading(null); };
                        const safetyTimer = setTimeout(cleanup, 45000);
                        iframe.onload = async () => {
                          // Poll until invoice-print-area has rendered content
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
                            const html2canvas = (await import("html2canvas")).default;
                            const { jsPDF } = await import("jspdf");
                            const A4_PX = 794;
                            const SCALE = 2;

                            // Measure row boundaries at A4 width before capture
                            const prevW = el.style.width, prevMin = el.style.minWidth, prevMax = el.style.maxWidth;
                            el.style.width = `${A4_PX}px`;
                            el.style.minWidth = `${A4_PX}px`;
                            el.style.maxWidth = `${A4_PX}px`;
                            el.getBoundingClientRect();
                            const elTop = el.getBoundingClientRect().top;
                            const rowSplitPoints = Array.from(el.querySelectorAll("tbody tr, tfoot tr")).map(
                              (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
                            );
                            const colHdrRow = el.querySelector("#invoice-col-header") as HTMLElement | null;
                            const colHdrTop = colHdrRow ? Math.round((colHdrRow.getBoundingClientRect().top - elTop) * SCALE) : 0;
                            const colHdrH   = colHdrRow ? Math.round(colHdrRow.getBoundingClientRect().height * SCALE) : 0;
                            el.style.width = prevW; el.style.minWidth = prevMin; el.style.maxWidth = prevMax;

                            const canvas = await html2canvas(el, {
                              scale: SCALE, useCORS: true, backgroundColor: "#fff",
                              width: A4_PX, windowWidth: A4_PX,
                              onclone: (clonedDoc) => {
                                clonedDoc.documentElement.classList.remove("dark");
                                const printEl = clonedDoc.getElementById("invoice-print-area");
                                if (printEl) {
                                  printEl.style.width = `${A4_PX}px`;
                                  printEl.style.minWidth = `${A4_PX}px`;
                                  printEl.style.maxWidth = `${A4_PX}px`;
                                }
                              },
                            });
                            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                            const pageW = pdf.internal.pageSize.getWidth();
                            const pageH = pdf.internal.pageSize.getHeight();
                            const M = 5;
                            const contentW = pageW - M * 2;
                            const contentH = pageH - M * 2;
                            const mmPerPx = contentW / canvas.width;
                            const pageHeightPx = Math.floor(contentH / mmPerPx);

                            const cropPage = (s: number, e: number, prependHeader: boolean) => {
                              const rowH = e - s;
                              const extraH = prependHeader ? colHdrH : 0;
                              const pc = document.createElement("canvas");
                              pc.width = canvas.width; pc.height = extraH + rowH;
                              const ctx = pc.getContext("2d")!;
                              ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, extraH + rowH);
                              if (prependHeader) {
                                ctx.drawImage(canvas, 0, colHdrTop, canvas.width, colHdrH, 0, 0, canvas.width, colHdrH);
                              }
                              ctx.drawImage(canvas, 0, s, canvas.width, rowH, 0, extraH, canvas.width, rowH);
                              return pc.toDataURL("image/jpeg", 0.95);
                            };

                            const contentPageHeightPx = pageHeightPx - colHdrH;

                            if (canvas.height <= pageHeightPx) {
                              pdf.addImage(cropPage(0, canvas.height, false), "JPEG", M, M, contentW, canvas.height * mmPerPx);
                            } else {
                              let start = 0, pageNum = 0;
                              while (start < canvas.height) {
                                const available = pageNum === 0 ? pageHeightPx : contentPageHeightPx;
                                const idealEnd = Math.min(start + available, canvas.height);
                                let splitAt = idealEnd;
                                if (idealEnd < canvas.height) {
                                  const safe = rowSplitPoints.filter(b => b > start && b <= idealEnd);
                                  if (safe.length > 0) splitAt = safe[safe.length - 1];
                                }
                                const ph = pageNum > 0;
                                const totalH = (splitAt - start) + (ph ? colHdrH : 0);
                                if (pageNum > 0) pdf.addPage();
                                pdf.addImage(cropPage(start, splitAt, ph), "JPEG", M, M, contentW, totalH * mmPerPx);
                                start = splitAt; pageNum++;
                              }
                            }

                            const url = URL.createObjectURL(pdf.output("blob"));
                            const a = document.createElement("a");
                            a.href = url; a.download = `${inv.invoiceNumber}.pdf`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 2000);
                          } catch {}
                          clearTimeout(safetyTimer); cleanup();
                        };
                        document.body.appendChild(iframe);
                        iframe.src = `/invoices/${inv.id}`;
                      }}>PDF</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(inv)}>Delete</Button>
                    </div>
                  </td>
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
            label="invoices"
          />
        )}
      </div>
    </div>
    </>
  );
}
