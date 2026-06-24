"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { fetchCached, bustCache } from "@/lib/useCache";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Select, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import Image from "next/image";

interface InvoiceItem {
  id: string; name: string; unit: string;
  quantity: number; price: number; gstRate: number; gstAmount: number; total: number;
}
interface Payment {
  id: string; date: string; amount: number; method: string; reference: string;
}
interface Invoice {
  id: string; invoiceNumber: string; date: string; dueDate?: string; createdAt: string;
  status: string; isInterState: boolean;
  customer: { name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string; };
  items: InvoiceItem[];
  payments: Payment[];
  subtotal: number; cgst: number; sgst: number; igst: number;
  total: number; paidAmount: number; notes: string;
}

interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string;
}

const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "var(--c-border)",
      animation: "skPulse 1.4s ease-in-out infinite",
    }} />
  );
}

function InvoiceSkeleton() {
  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <div className="page-stack">
        {/* toolbar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"0.75rem" }}>
          <Sk w={180} h={14} />
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <Sk w={80} h={32} r={8} />
            <Sk w={100} h={32} r={8} />
          </div>
        </div>

        {/* header card */}
        <div className="card" style={{ padding:"1.25rem", display:"flex", flexWrap:"wrap", gap:"1rem", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <Sk w={160} h={22} />
            <Sk w={100} h={14} />
          </div>
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <Sk w={90} h={32} r={8} />
            <Sk w={110} h={32} r={8} />
          </div>
        </div>

        {/* invoice body card */}
        <div className="card" style={{ padding:"1.25rem" }}>
          {/* meta rows */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem", marginBottom:"1.25rem" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <Sk w={80} h={11} />
                <Sk w="70%" h={15} />
              </div>
            ))}
          </div>

          {/* table header */}
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:"0.5rem", marginBottom:"0.5rem" }}>
            {["Item", "Qty", "Rate", "GST", "Total"].map(col => (
              <Sk key={col} w="80%" h={11} />
            ))}
          </div>

          {/* table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:"0.5rem", marginBottom:"0.5rem" }}>
              <Sk w="90%" h={14} />
              <Sk w="60%" h={14} />
              <Sk w="70%" h={14} />
              <Sk w="50%" h={14} />
              <Sk w="80%" h={14} />
            </div>
          ))}

          {/* totals */}
          <div style={{ marginTop:"1rem", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display:"flex", gap:"1rem" }}>
                <Sk w={100} h={14} />
                <Sk w={80} h={14} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "Cash", reference: "" });
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function load(force = false) {
    try {
      const [data, s] = await Promise.all([
        fetchCached<Invoice>(`/api/invoices/${id}`, force),
        fetchCached<BusinessSettings>("/api/settings"),
      ]);
      setInvoice(data);
      setSettings(s);
    } catch { setError("Invoice not found."); }
    setLoading(false);
  }
  useEffect(() => {
    Promise.all([
      fetchCached<Invoice>(`/api/invoices/${id}`),
      fetchCached<BusinessSettings>("/api/settings"),
    ]).then(([data, s]) => {
      setInvoice(data as Invoice);
      setSettings(s as BusinessSettings);
      setLoading(false);
    }).catch(() => {
      setError("Invoice not found.");
      setLoading(false);
    });
  }, [id]);

  // Auto-trigger print/save-as-PDF when ?print=1 is in the URL
  useEffect(() => {
    if (!invoice) return;
    const shouldPrint = new URLSearchParams(window.location.search).get("print") === "1";
    if (shouldPrint) {
      const timer = setTimeout(() => {
        const prev = document.title;
        document.title = invoice.invoiceNumber;
        window.print();
        setTimeout(() => { document.title = prev; }, 1000);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [invoice]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(paymentForm.amount);
    if (isNaN(amt) || amt <= 0) { setPaymentError("Enter a valid amount."); return; }
    if (amt > balance) { setPaymentError(`Amount cannot exceed balance due (₹${fmt(balance)}).`); return; }
    setPaymentError(""); setAddingPayment(true);
    const res = await fetch(`/api/invoices/${id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, method: paymentForm.method, reference: paymentForm.reference }),
    });
    setAddingPayment(false);
    if (res.ok) {
      setShowPaymentForm(false);
      setPaymentForm({ amount: "", method: "Cash", reference: "" });
      bustCache(`/api/invoices/${id}`);
      load(true);
      toast({ type: "success", title: "Payment recorded", message: `₹${parseFloat(paymentForm.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} via ${paymentForm.method}` });
    } else {
      const d = await res.json().catch(() => ({}));
      setPaymentError(d?.error ?? "Failed to record payment.");
    }
  }

  async function generatePdfBlob(): Promise<Blob | null> {
    const el = document.getElementById("invoice-print-area");
    if (!el) return null;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const A4_PX = 794;
      const SCALE = 2;

      // Temporarily resize to A4 width to measure exact row boundary positions
      const prevW = el.style.width, prevMin = el.style.minWidth, prevMax = el.style.maxWidth;
      el.style.width = `${A4_PX}px`;
      el.style.minWidth = `${A4_PX}px`;
      el.style.maxWidth = `${A4_PX}px`;
      el.getBoundingClientRect(); // force reflow
      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top;
      // Collect bottom edge of every row (tbody + tfoot) in canvas pixels
      const rowSplitPoints = Array.from(el.querySelectorAll("tbody tr, tfoot tr")).map(
        (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
      );
      // Measure the column header row to repeat it on subsequent pages
      const colHdrRow = el.querySelector("#invoice-col-header") as HTMLElement | null;
      const colHdrTop = colHdrRow ? Math.round((colHdrRow.getBoundingClientRect().top - elTop) * SCALE) : 0;
      const colHdrH   = colHdrRow ? Math.round(colHdrRow.getBoundingClientRect().height * SCALE) : 0;
      el.style.width = prevW;
      el.style.minWidth = prevMin;
      el.style.maxWidth = prevMax;

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
      const M = 5; // 5mm margin all sides
      const contentW = pageW - M * 2;
      const contentH = pageH - M * 2;
      const mmPerPx = contentW / canvas.width;
      const pageHeightPx = Math.floor(contentH / mmPerPx);

      const cropPage = (startPx: number, endPx: number, prependHeader: boolean) => {
        const rowH = endPx - startPx;
        const extraH = prependHeader ? colHdrH : 0;
        const pc = document.createElement("canvas");
        pc.width = canvas.width;
        pc.height = extraH + rowH;
        const ctx = pc.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, extraH + rowH);
        if (prependHeader) {
          ctx.drawImage(canvas, 0, colHdrTop, canvas.width, colHdrH, 0, 0, canvas.width, colHdrH);
        }
        ctx.drawImage(canvas, 0, startPx, canvas.width, rowH, 0, extraH, canvas.width, rowH);
        return pc.toDataURL("image/jpeg", 0.95);
      };

      // Pages 2+ have less usable height because the header is prepended
      const contentPageHeightPx = pageHeightPx - colHdrH;

      if (canvas.height <= pageHeightPx) {
        pdf.addImage(cropPage(0, canvas.height, false), "JPEG", M, M, contentW, canvas.height * mmPerPx);
      } else {
        let start = 0;
        let pageNum = 0;
        while (start < canvas.height) {
          const available = pageNum === 0 ? pageHeightPx : contentPageHeightPx;
          const idealEnd = Math.min(start + available, canvas.height);
          let splitAt = idealEnd;
          if (idealEnd < canvas.height) {
            const safe = rowSplitPoints.filter(b => b > start && b <= idealEnd);
            if (safe.length > 0) splitAt = safe[safe.length - 1];
          }
          const prependHeader = pageNum > 0;
          const totalH = (splitAt - start) + (prependHeader ? colHdrH : 0);
          if (pageNum > 0) pdf.addPage();
          pdf.addImage(cropPage(start, splitAt, prependHeader), "JPEG", M, M, contentW, totalH * mmPerPx);
          start = splitAt;
          pageNum++;
        }
      }

      return pdf.output("blob");
    } catch { return null; }
  }

  function handlePrint() {
    if (!invoice) return;
    const prev = document.title;
    document.title = invoice.invoiceNumber;
    window.print();
    setTimeout(() => { document.title = prev; }, 1000);
  }

  async function handleShare(channel: "native" | "whatsapp" | "email" | "copy") {
    setShareOpen(false);
    if (!invoice) return;
    const num = invoice.invoiceNumber;
    const customer = invoice.customer.name;

    // Generate PDF for all channels
    setShareLoading(true);
    await document.fonts.ready;
    const blob = await generatePdfBlob();
    setShareLoading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const file = new File([blob], `${num}.pdf`, { type: "application/pdf" });

    // Helper to trigger a PDF download
    const downloadPdf = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${num}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    if (channel === "native") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Invoice ${num}` });
        } else {
          downloadPdf();
          toast({ type: "success", title: "PDF Downloaded", message: `${num}.pdf saved to your device.` });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
      }
      return;
    }

    if (channel === "whatsapp") {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Invoice ${num}`, text: `Invoice ${num} from Science Hub — ₹${fmt(invoice.total)}` });
        } catch (err) {
          if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
        }
      } else {
        toast({ type: "error", title: "Not supported", message: "File sharing is not supported on this browser." });
      }
      return;
    }

    if (channel === "email") {
      const toEmail = invoice.customer.email;
      if (!toEmail) {
        toast({ type: "error", title: "No email on file", message: "This customer has no email address. Add one on the customer profile." });
        return;
      }
      setShareLoading(true);
      try {
        const formData = new FormData();
        formData.append("pdf", blob, `${num}.pdf`);
        formData.append("to", toEmail);
        formData.append("invoiceNumber", num);
        formData.append("customerName", customer);
        formData.append("total", fmt(invoice.total));
        const res = await fetch("/api/send-invoice", { method: "POST", body: formData });
        if (res.ok) {
          toast({ type: "success", title: "Email sent", message: `Invoice ${num} sent to ${toEmail}` });
        } else {
          const d = await res.json().catch(() => ({}));
          toast({ type: "error", title: "Email failed", message: d.error ?? "Could not send email." });
        }
      } catch {
        toast({ type: "error", title: "Email failed", message: "Network error. Could not send email." });
      }
      setShareLoading(false);
      return;
    }

    if (channel === "copy") {
      downloadPdf();
      toast({ type: "success", title: "PDF Downloaded", message: `${num}.pdf saved to your device.` });
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ type: "success", title: "Deleted", message: `Invoice moved to bin.` });
        router.push("/invoices");
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete invoice." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
    setDeleting(false);
    setDeleteConfirm(false);
  }

  if (loading) return <InvoiceSkeleton />;
  if (error || !invoice) return <div className="loading-center" style={{ color: "var(--c-red)" }}>{error || "Invoice not found."}</div>;

  const balance = invoice.total - invoice.paidAmount;

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Invoice"
        message={`Move invoice ${invoice?.invoiceNumber} to bin? You can restore it within 30 days.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteConfirm(false); }}
      />
      {shareLoading && <OverlayLoader text="Preparing PDF…" />}
      {addingPayment && <OverlayLoader text="Saving payment…" />}
      <style>{`
        #invoice-print-area {
          --inv-bg:#fff;--inv-bg2:#f8fafc;--inv-bg3:#f1f5f9;--inv-bg4:#e2e8f0;
          --inv-bd:#475569;--inv-bd2:#94a3b8;
          --inv-tx:#0f172a;--inv-tx2:#334155;--inv-tx3:#64748b;
          --inv-brand:#1e3a8a;--inv-green:#059669;--inv-blue:#2563eb;--inv-red:#dc2626;
        }
        .dark #invoice-print-area {
          --inv-bg:#0f172a;--inv-bg2:#1e293b;--inv-bg3:#1e293b;--inv-bg4:#334155;
          --inv-bd:#475569;--inv-bd2:#334155;
          --inv-tx:#f1f5f9;--inv-tx2:#cbd5e1;--inv-tx3:#94a3b8;
          --inv-brand:#93c5fd;--inv-green:#34d399;--inv-blue:#60a5fa;--inv-red:#f87171;
        }
        @page { size: A4 portrait; margin: 12mm 8mm; }
        @media print {
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          html,body{background:#fff!important;color:#0f172a!important}
          body *{visibility:hidden!important}
          #invoice-print-area,#invoice-print-area *{visibility:visible!important}
          #invoice-print-area{
            position:absolute!important;top:0!important;left:0!important;
            width:100%!important;height:auto!important;padding:4px!important;
            box-shadow:none!important;border-radius:0!important;
            --inv-bg:#fff!important;--inv-bg2:#f8fafc!important;--inv-bg3:#f1f5f9!important;--inv-bg4:#e2e8f0!important;
            --inv-bd:#475569!important;--inv-bd2:#94a3b8!important;
            --inv-tx:#0f172a!important;--inv-tx2:#334155!important;--inv-tx3:#64748b!important;
            --inv-brand:#1e3a8a!important;--inv-green:#059669!important;--inv-blue:#2563eb!important;--inv-red:#dc2626!important;
          }
          #invoice-print-area > div { height:auto!important; overflow:visible!important; }
          #invoice-print-area table { height:auto!important; border-collapse:collapse!important; }
          #invoice-print-area thead { display:table-header-group!important; }
          #invoice-print-area tfoot { display:table-footer-group!important; }
          #invoice-print-area tbody tr { break-inside:avoid!important; page-break-inside:avoid!important; }
          #invoice-print-area tfoot tr { break-inside:avoid!important; page-break-inside:avoid!important; }
        }
      `}</style>

      <div className="page-stack">
        {/* Toolbar */}
        <div className="page-header no-print">
          <Breadcrumb items={[{ label: "Invoices", href: "/invoices" }, { label: invoice.invoiceNumber }]} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <StatusBadge status={invoice.status} />
            <Button variant="editOutline" size="sm" href={`/invoices/edit/${id}`}>Edit Invoice</Button>
            {balance > 0 && (
              <Button
                variant="greenPrimary"
                size="sm"
                onClick={() => {
                  setPaymentForm({ amount: "", method: "Cash", reference: "" });
                  setPaymentError("");
                  setShowPaymentForm(true);
                }}
              >
                + Record Payment
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              Download / Print PDF
            </Button>
            <Button variant="dangerOutline" size="sm" disabled={deleting} onClick={() => setDeleteConfirm(true)}>
              Delete
            </Button>
            {/* Share PDF button */}
            <div style={{ position: "relative" }}>
              <Button variant="secondary" size="sm" disabled={shareLoading} onClick={() => setShareOpen(o => !o)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "0.375rem" }}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share PDF
              </Button>
              {shareOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShareOpen(false)} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
                    background: "var(--c-bg-card)",
                    border: "1px solid var(--c-border-md)",
                    borderRadius: "0.5rem",
                    boxShadow: "0 8px 24px -4px rgba(0,0,0,.18), 0 2px 8px -2px rgba(0,0,0,.12)",
                    minWidth: "15rem", overflow: "hidden",
                    padding: "0.375rem 0",
                  }}>
                    <div style={{
                      padding: "0.5rem 1rem 0.375rem",
                      fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "var(--c-text-4)",
                      borderBottom: "1px solid var(--c-border)",
                      marginBottom: "0.25rem",
                    }}>Share PDF</div>
                    {([
                      typeof navigator !== "undefined" && "share" in navigator ? {
                        key: "native", label: "Share / Send File",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
                        color: "var(--c-blue)",
                      } : null,
                      {
                        key: "whatsapp", label: "WhatsApp",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                        color: "#25d366",
                      },
                      {
                        key: "email", label: "Email",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
                        color: "var(--c-text-2)",
                      },
                      {
                        key: "copy", label: "Download PDF",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
                        color: "var(--c-text-2)",
                      },
                    ] as const).filter(Boolean).map((opt) => (
                      <button
                        key={opt!.key}
                        onClick={() => handleShare(opt!.key as "native" | "whatsapp" | "email" | "copy")}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.75rem",
                          width: "100%", padding: "0.625rem 1rem",
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: "0.875rem", color: "var(--c-text)", textAlign: "left",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg-sub)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ color: opt!.color, flexShrink: 0, display: "flex" }}>{opt!.icon}</span>
                        {opt!.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment form */}
        {showPaymentForm && (
          <div className="card no-print" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", marginBottom: "0.75rem" }}>Record Payment</h3>
            {paymentError && <div className="error-banner" style={{ marginBottom: "0.75rem" }}>{paymentError}</div>}
            <form onSubmit={handleAddPayment} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
              <FormField label="Amount (₹)">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={paymentForm.amount}
                    onChange={(e) => { setPaymentError(""); setPaymentForm((p) => ({ ...p, amount: e.target.value })); }}
                    placeholder={`e.g. ${balance.toFixed(2)}`}
                    sz="sm"
                    style={{ width: "9rem" }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPaymentForm((p) => ({ ...p, amount: balance.toFixed(2) }))}
                    style={{
                      fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.5rem",
                      borderRadius: "0.375rem", border: "1px solid var(--c-green-border)",
                      background: "var(--c-green-bg)", color: "var(--c-green-text)",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Full ₹{fmt(balance)}
                  </button>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--c-text-4)", marginTop: "0.2rem" }}>
                  Balance due: ₹{fmt(balance)}
                </p>
              </FormField>
              <FormField label="Method">
                <Select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                  sz="sm"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Reference / UTR">
                <Input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Optional"
                  sz="sm"
                  style={{ width: "10rem" }}
                />
              </FormField>
              <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "0.125rem" }}>
                <Button type="submit" variant="greenPrimary" size="sm" disabled={addingPayment}>
                  Save Payment
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        )}

        {/* Invoice print area */}
        <div id="invoice-print-area"
          style={{ background: "var(--inv-bg)", color: "var(--inv-tx)", borderRadius: "0.75rem", boxShadow: "var(--c-shadow-sm)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th colSpan={invoice.isInterState ? 9 : 10}
                    style={{ background: "var(--inv-brand)", color: "var(--inv-bg)", textAlign: "center",
                      padding: "10px 0", fontWeight: 700, letterSpacing: "0.15em", fontSize: 14,
                      textTransform: "uppercase", border: "1px solid var(--inv-bd)" }}>
                    TAX INVOICE
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td rowSpan={invoice.dueDate ? 5 : 4} colSpan={invoice.isInterState ? 4 : 5}
                    style={{ border: "1px solid var(--inv-bd)", padding: "14px 16px", verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Image src="/logo.png" alt={settings?.name ?? "Logo"} width={36} height={36} style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }} />
                      <strong style={{ fontSize: 15, color: "var(--inv-brand)" }}>{settings?.name}</strong>
                    </div>
                    <div style={{ color: "var(--inv-tx2)", lineHeight: 1.6 }}>
                      {settings?.tagline && <div>{settings.tagline}</div>}
                      {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
                        <div>{[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}</div>
                      )}
                      {settings?.phone && <div>Ph: {settings.phone}</div>}
                      {settings?.email && <div>{settings.email}</div>}
                    </div>
                  </td>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,whiteSpace:"nowrap",background:"var(--inv-bg2)",width:"14%" }}>Invoice No.</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",fontWeight:700,color:"var(--inv-tx)" }}>{invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Invoice Date</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                    {new Date(invoice.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Created At</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                    {new Date(invoice.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                  </td>
                </tr>
                {invoice.dueDate && (
                  <tr>
                    <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Due Date</td>
                    <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                      {new Date(invoice.dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Supply Type</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",
                    color: invoice.isInterState ? "var(--inv-blue)" : "var(--inv-green)", fontWeight:600 }}>
                    {invoice.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}
                  </td>
                </tr>

                {/* Bill To */}
                <tr>
                  <td colSpan={invoice.isInterState ? 9 : 10} style={{ border:"1px solid var(--inv-bd)",padding:0 }}>
                    <div style={{ background:"var(--inv-bg3)",padding:"5px 14px",fontSize:11,fontWeight:700,
                      textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--inv-tx2)",borderBottom:"1px solid var(--inv-bd)" }}>
                      Bill To
                    </div>
                    <div style={{ padding:"10px 14px" }}>
                      <div style={{ fontWeight:700,fontSize:13,color:"var(--inv-tx)",marginBottom:2 }}>{invoice.customer.name}</div>
                      {invoice.customer.address && <div style={{ color:"var(--inv-tx2)" }}>{invoice.customer.address}</div>}
                      <div style={{ color:"var(--inv-tx2)" }}>{[invoice.customer.city,invoice.customer.state,invoice.customer.pincode].filter(Boolean).join(", ")}</div>
                      <div style={{ display:"flex",gap:16,marginTop:4,flexWrap:"wrap" }}>
                        {invoice.customer.phone && <span style={{ color:"var(--inv-tx3)" }}>Ph: {invoice.customer.phone}</span>}
                        {invoice.customer.email && <span style={{ color:"var(--inv-tx3)" }}>Email: {invoice.customer.email}</span>}
                        {invoice.customer.gstin && (
                          <span style={{ fontFamily:"monospace",fontWeight:600,color:"var(--inv-tx2)",
                            background:"var(--inv-bg3)",border:"1px solid var(--inv-bd2)",borderRadius:3,padding:"1px 6px" }}>
                            GSTIN: {invoice.customer.gstin}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Items header */}
                <tr id="invoice-col-header" style={{ background:"var(--inv-bg3)",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--inv-tx2)" }}>
                  {[
                    ["#","center","3%"],["Description","left","25%"],
                    ["Qty","center","5%"],["Unit","center","5%"],["Rate (₹)","right","9%"],
                    ["Taxable (₹)","right","9%"],["GST%","center","5%"],
                  ].map(([label, align, width]) => (
                    <td key={label} style={{ border:"1px solid var(--inv-bd)",padding:"8px 8px",textAlign:align as "left"|"right"|"center",width,whiteSpace:"nowrap" }}>{label}</td>
                  ))}
                  {invoice.isInterState
                    ? <td style={{ border:"1px solid var(--inv-bd)",padding:"8px 8px",textAlign:"right",width:"10%",whiteSpace:"nowrap" }}>IGST (₹)</td>
                    : <>
                        <td style={{ border:"1px solid var(--inv-bd)",padding:"8px 8px",textAlign:"right",width:"9%",whiteSpace:"nowrap" }}>CGST (₹)</td>
                        <td style={{ border:"1px solid var(--inv-bd)",padding:"8px 8px",textAlign:"right",width:"9%",whiteSpace:"nowrap" }}>SGST (₹)</td>
                      </>
                  }
                  <td style={{ border:"1px solid var(--inv-bd)",padding:"8px 8px",textAlign:"right",width:"10%",whiteSpace:"nowrap" }}>Total (₹)</td>
                </tr>

                {/* Item rows */}
                {invoice.items.map((item, idx) => {
                  const taxable = item.quantity * item.price;
                  const halfGst = item.gstAmount / 2;
                  const rowBg = idx % 2 === 1 ? "var(--inv-bg2)" : "var(--inv-bg)";
                  const c = (content: React.ReactNode, align: "left"|"right"|"center" = "center", bold = false) => (
                    <td style={{ border:"1px solid var(--inv-bd)",padding:"7px 8px",textAlign:align,
                      fontWeight:bold?700:undefined,background:rowBg,color:bold?"var(--inv-tx)":"var(--inv-tx2)" }}>
                      {content}
                    </td>
                  );
                  return (
                    <tr key={item.id}>
                      {c(idx + 1)}
                      <td style={{ border:"1px solid var(--inv-bd)",padding:"7px 10px",background:rowBg,fontWeight:600,color:"var(--inv-tx)",wordBreak:"break-word" }}>{item.name}</td>
                      {c(item.quantity)}{c(item.unit)}
                      {c(fmt(item.price),"right")}
                      {c(fmt(taxable),"right")}
                      {c(`${item.gstRate}%`)}
                      {invoice.isInterState
                        ? c(fmt(item.gstAmount),"right")
                        : <>{c(fmt(halfGst),"right")}{c(fmt(halfGst),"right")}</>}
                      {c(fmt(item.total),"right",true)}
                    </tr>
                  );
                })}

                {/* Notes + Totals */}
                <tr>
                  <td colSpan={invoice.isInterState ? 4 : 5} rowSpan={invoice.isInterState ? 6 : 7}
                    style={{ border:"1px solid var(--inv-bd)",padding:"14px 16px",verticalAlign:"top",color:"var(--inv-tx3)" }}>
                    <div style={{ display:"flex",flexDirection:"column",height:"100%",minHeight:120 }}>
                      <div style={{ marginTop:"auto" }}>
                        {invoice.notes
                          ? <><div style={{ fontWeight:700,textTransform:"uppercase",fontSize:11,marginBottom:4,color:"var(--inv-tx2)" }}>Notes</div><p>{invoice.notes}</p></>
                          : <p style={{ fontStyle:"italic",opacity:0.5 }}>No notes</p>}
                        <p style={{ marginTop:10,fontSize:11,opacity:0.55 }}>This is a computer-generated invoice.</p>
                        <div style={{ marginTop:16,marginLeft:8,marginRight:8,borderTop:"1px solid var(--inv-bd2)",paddingTop:8 }}>
                          <div style={{ fontSize:11,fontWeight:600,color:"var(--inv-tx2)",marginBottom:20 }}>For {settings?.name}</div>
                          <div style={{ fontSize:10,color:"var(--inv-tx3)" }}>Authorised Signatory</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>Subtotal</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.subtotal)}</td>
                </tr>
                {invoice.isInterState ? (
                  <tr>
                    <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>IGST</td>
                    <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.igst)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>CGST</td>
                      <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.cgst)}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>SGST</td>
                      <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.sgst)}</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",fontWeight:700,color:"var(--inv-tx)",background:"var(--inv-bg4)",fontSize:13 }}>Grand Total</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",textAlign:"right",fontWeight:700,color:"var(--inv-tx)",background:"var(--inv-bg4)",fontSize:13 }}>₹{fmt(invoice.total)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-green)",background:"var(--inv-bg2)" }}>Paid</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-green)",fontWeight:600,background:"var(--inv-bg2)" }}>₹{fmt(invoice.paidAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",fontWeight:700,color:"var(--inv-tx)",background:"var(--inv-bg3)" }}>Balance Due</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",textAlign:"right",fontWeight:700,fontSize:14,background:"var(--inv-bg3)",
                    color: balance > 0 ? "var(--inv-red)" : "var(--inv-green)" }}>₹{fmt(balance)}</td>
                </tr>

              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={invoice.isInterState ? 9 : 10}
                    style={{ border:"1px solid var(--inv-bd)",padding:"8px 16px",textAlign:"center",fontSize:11,color:"var(--inv-tx3)",background:"var(--inv-bg2)" }}>
                    Thank you for your business · {settings?.name}{settings?.email ? ` · ${settings.email}` : ""}{settings?.phone ? ` · ${settings.phone}` : ""}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payment history */}
        {invoice.payments.length > 0 && (
          <div className="card no-print">
            <div style={{ padding:"1rem 1.25rem",borderBottom:"1px solid var(--c-border)" }}>
              <h2 style={{ fontWeight:600,color:"var(--c-text)",fontSize:"0.875rem" }}>Payment History</h2>
            </div>
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th className="table-th-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Date" style={{ color:"var(--c-text-3)" }}>{new Date(p.date).toLocaleDateString("en-IN")}</td>
                      <td data-label="Method" style={{ color:"var(--c-text-3)" }}>{p.method}</td>
                      <td data-mobile-hide style={{ color:"var(--c-text-4)",fontFamily:"var(--font-mono)",fontSize:"0.75rem" }}>{p.reference || "—"}</td>
                      <td data-label="Amount" data-mobile-full className="table-td-right" style={{ fontWeight:500,color:"var(--c-green)" }}>₹{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
