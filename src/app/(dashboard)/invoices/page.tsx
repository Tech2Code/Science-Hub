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
  total: number;
  paidAmount: number;
  status: string;
}

type StatusFilter = "All" | "unpaid" | "partial" | "paid";
const STATUS_TABS: StatusFilter[] = ["All", "unpaid", "partial", "paid"];

export default function InvoicesPage() {
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const apiUrl = filter === "All" ? "/api/invoices" : `/api/invoices?status=${filter}`;
  const { data, loading, mutate } = useFetch<Invoice[]>(apiUrl);
  const invoices = data ?? [];

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [invoices.length, page]);

  const { visible } = usePagination(invoices, page, showAll);

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
          <p className="page-sub">{invoices.length} invoices</p>
        </div>
        <Button variant="primary" href="/invoices/new">+ New Invoice</Button>
      </div>

      {/* Status filter tabs + show-all toggle */}
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
        {!loading && (
          <ShowAllToggle total={invoices.length} showAll={showAll} onToggle={() => { setShowAll((v) => !v); setPage(1); }} />
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="table-th-right">Total</th>
                <th className="table-th-right">Paid</th>
                <th className="table-th-right">Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={8} />
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "3rem", color: "var(--c-text-4)" }}>
                  No invoices found.
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
                  <td data-label="Total" className="table-td-right" style={{ fontWeight: 500, color: "var(--c-text)" }}>₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-mobile-hide className="table-td-right" style={{ color: "var(--c-green)" }}>₹{inv.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Balance" className="table-td-right" style={{ color: "var(--c-text)" }}>₹{(inv.total - inv.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td data-label="Status"><StatusBadge status={inv.status} /></td>
                  <td data-mobile-full>
                    <div className="table-actions" style={{ flexWrap: "wrap" }}>
                      <Button variant="viewOutline" size="sm" href={`/invoices/${inv.id}`}>View</Button>
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
                            const canvas = await html2canvas(el, {
                              scale: 2, useCORS: true, backgroundColor: "#fff",
                              onclone: (clonedDoc) => { clonedDoc.documentElement.classList.remove("dark"); },
                            });
                            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                            const imgW = 210;
                            const imgH = (canvas.height * imgW) / canvas.width;
                            pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, imgW, imgH);
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
                      }}>Download PDF</Button>
                      <Button variant="dangerOutline" size="sm" onClick={() => setDeleteTarget(inv)}>Delete</Button>
                      {inv.status !== "paid" && (
                        <Button variant="editOutline" size="sm" href={`/invoices/edit/${inv.id}`}>Edit</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && invoices.length > 0 && (
          <Pagination
            total={invoices.length}
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
