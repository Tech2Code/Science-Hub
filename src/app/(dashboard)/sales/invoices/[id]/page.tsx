"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { fetchCached, bustCache } from "@/lib/useCache";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Select, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { PdfCopyDialog } from "@/components/dialogs/PdfCopyDialog";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import styles from "./invoiceDetail.module.css";

interface InvoiceItem {
  id: string; productId: string; name: string; unit: string;
  quantity: number; price: number; gstRate: number; gstAmount: number; total: number;
}
interface Payment {
  id: string; date: string; amount: number; method: string; reference: string;
}
interface ReturnRecord {
  id: string; date: string; notes: string | null; createdAt: string;
  items: { id: string; name: string; quantity: number; price: number; total: number; productId: string | null }[];
}
interface ReturnFormItem {
  productId: string; name: string; price: number; selected: boolean; qty: number; maxQty: number; qtyText: string;
}
interface Invoice {
  id: string; invoiceNumber: string; date: string; dueDate?: string; createdAt: string;
  status: string; isInterState: boolean;
  createdBy?: { id: string; name: string };
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

// Use createdAt (always a full server timestamp) for display rather than date
// (which is a user-picked date-only value stored as UTC midnight).
function parseDate(d: string) {
  return new Date(d);
}
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

        {/* Toolbar — breadcrumb + 7 action buttons */}
        <div className={styles.skToolbarRow}>
          <div className={styles.skFlexGap5}>
            <Sk w={70} h={13} r={4} />
            <Sk w={8} h={13} r={2} />
            <Sk w={110} h={13} r={4} />
          </div>
          <div className={styles.skActionsRow}>
            <Sk w={28} h={28} r={6} />
            <Sk w={100} h={28} r={6} />
            <Sk w={118} h={28} r={6} />
            <Sk w={105} h={28} r={6} />
            <Sk w={95} h={28} r={6} />
            <Sk w={62} h={28} r={6} />
            <Sk w={85} h={28} r={6} />
            <Sk w={90} h={28} r={6} />
          </div>
        </div>

        {/* Invoice print area */}
        <div className={`card ${styles.skCard}`}>
          {/* TAX INVOICE header bar */}
          <Sk w="100%" h={40} r={0} />

          <div className={styles.skTwoCol}>
            {/* Left: company info */}
            <div className={styles.skCompanyCol}>
              <div className={styles.skFlexGap5}>
                <Sk w={36} h={36} r={4} />
                <Sk w={130} h={16} r={4} />
              </div>
              <Sk w="80%" h={11} r={3} />
              <Sk w="65%" h={11} r={3} />
              <Sk w="50%" h={11} r={3} />
            </div>
            {/* Right: invoice meta rows */}
            <div className={styles.skMetaCol}>
              {["Invoice No.", "Date", "Created By", "Supply Type"].map(label => (
                <div key={label} className={styles.skMetaRow}>
                  <Sk w="70%" h={11} r={3} />
                  <Sk w="85%" h={11} r={3} />
                </div>
              ))}
            </div>
          </div>

          {/* Bill To section */}
          <div className={styles.skBillTo}>
            <Sk w={60} h={10} r={3} />
            <Sk w={180} h={14} r={3} />
            <Sk w={220} h={11} r={3} />
            <div className={styles.skBillToRow}>
              <Sk w={100} h={11} r={3} />
              <Sk w={160} h={11} r={3} />
            </div>
          </div>

          {/* Items table header */}
          <div className={styles.skTableHeader}>
            {Array.from({ length: 10 }).map((_, i) => <Sk key={i} w="75%" h={10} r={3} />)}
          </div>

          {/* Item rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skTableRow}>
              <Sk w="60%" h={12} r={3} />
              <Sk w="85%" h={12} r={3} />
              <Sk w="70%" h={12} r={3} />
              <Sk w="70%" h={12} r={3} />
              <Sk w="80%" h={12} r={3} />
              <Sk w="80%" h={12} r={3} />
              <Sk w="60%" h={12} r={3} />
              <Sk w="75%" h={12} r={3} />
              <Sk w="75%" h={12} r={3} />
              <Sk w="85%" h={12} r={3} />
            </div>
          ))}

          {/* Totals rows */}
          <div className={styles.skTotalsRow}>
            <div className={styles.skTotalsLeft}>
              <Sk w="60%" h={11} r={3} />
            </div>
            <div className={styles.skTotalsRight}>
              {["Subtotal", "CGST", "SGST", "Grand Total", "Paid", "Balance Due"].map(label => (
                <div key={label} className={styles.skTotalsLine}>
                  <Sk w="60%" h={11} r={3} />
                  <Sk w="70%" h={11} r={3} />
                </div>
              ))}
            </div>
          </div>

          {/* Footer bar */}
          <Sk w="100%" h={34} r={0} />
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLoadingText, setShareLoadingText] = useState("Preparing PDF…");
  const [shareDropStyle, setShareDropStyle] = useState<React.CSSProperties>({});
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const [showPaymentInPdf, setShowPaymentInPdf] = useState(false);
  const [showReturnInPdf, setShowReturnInPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfCopyDialogOpen, setPdfCopyDialogOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfPrinting, setPdfPrinting] = useState(false);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnFormItem[]>([]);
  const returnQtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [addingReturn, setAddingReturn] = useState(false);
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

  useEffect(() => {
    fetch(`/api/invoices/${id}/returns`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setReturns([]); return; }
        setReturns([...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      })
      .catch(() => {});
  }, [id]);

  // Set page title to invoice number so browser Ctrl+P / Save as PDF uses the right filename
  useEffect(() => {
    if (!invoice) return;
    const prev = document.title;
    document.title = invoice.invoiceNumber;
    return () => { document.title = prev; };
  }, [invoice]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const amtErr = validate(paymentForm.amount, rules.required("Amount is required."), rules.positiveNumber("Enter a valid amount greater than 0."));
    if (amtErr) { toast({ type: "error", title: "Check form", message: amtErr }); return; }
    const amt = parseFloat(paymentForm.amount);
    if (amt > balance) { toast({ type: "error", title: "Check form", message: `Amount cannot exceed balance due (₹${fmt(balance)}).` }); return; }
    setAddingPayment(true);
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
      toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to record payment." });
    }
  }

  function openReturnForm() {
    if (!invoice) return;
    const alreadyReturned: Record<string, number> = {};
    for (const ret of returns) {
      for (const ri of ret.items) {
        if (ri.productId) alreadyReturned[ri.productId] = (alreadyReturned[ri.productId] ?? 0) + ri.quantity;
      }
    }
    setReturnItems(invoice.items.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      selected: false,
      qty: 1,
      maxQty: item.quantity - (alreadyReturned[item.productId] ?? 0),
      qtyText: "1",
    })).filter(ri => ri.maxQty > 0));
    setReturnNotes("");
    setReturnDate(new Date().toISOString().split("T")[0]);
    setShowReturnForm(true);
  }

  useEffect(() => {
    if (!showReturnForm || addingReturn) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowReturnForm(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showReturnForm, addingReturn]);

  async function handleAddReturn(e: React.FormEvent) {
    e.preventDefault();
    const selected = returnItems.filter(ri => ri.selected && ri.qty > 0);
    if (selected.length === 0) { toast({ type: "error", title: "Check form", message: "Select at least one item to return." }); return; }
    for (const ri of selected) {
      if (ri.qty > ri.maxQty) { toast({ type: "error", title: "Check form", message: `${ri.name}: quantity exceeds returnable amount (max ${ri.maxQty}).` }); return; }
    }
    setAddingReturn(true);
    try {
      const res = await fetch(`/api/invoices/${id}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map(ri => ({ productId: ri.productId, name: ri.name, quantity: ri.qty, price: ri.price })),
          notes: returnNotes || undefined,
          date: returnDate || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setReturns(prev => [created, ...prev]);
        setShowReturnForm(false);
        bustCache(`/api/invoices/${id}`);
        bustCache("/api/products");
        toast({ type: "success", title: "Return recorded", message: `${selected.length} item(s) returned.` });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to record return." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setAddingReturn(false);
  }

  async function generatePdfBlob(copyLabels?: string[]): Promise<Blob | null> {
    const el = document.getElementById("invoice-print-area");
    if (!el) return null;
    return generateInvoicePdfBlob(el, copyLabels ? { copyLabels } : undefined);
  }

  function handleDownloadClick() {
    if (!invoice) return;
    setPdfCopyDialogOpen(true);
  }

  async function handleDownloadConfirm(copyLabels: string[]) {
    if (!invoice) return;
    setPdfDownloading(true);
    // Force a real paint before the CPU-heavy html2canvas work blocks the main
    // thread — `document.fonts.ready` alone often resolves as a microtask
    // without yielding a frame, so the loading spinner never gets drawn.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const blob = await generatePdfBlob(copyLabels);
    setPdfDownloading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfCopyDialogOpen(false);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${invoice.invoiceNumber}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handlePrint() {
    if (!invoice) return;
    // Print goes through the exact same generateInvoicePdfBlob() pipeline as
    // Download/View, so the printed output is byte-identical to the PDF file
    // — not a separate hand-rolled @media print layout that can drift out of
    // sync (it previously used table border-collapse, which silently drops
    // borders across colSpan boundaries; the PDF pipeline already works around
    // that by switching to border-collapse:separate with per-cell borders).
    setPdfPrinting(true);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY", "DUPLICATE COPY"]);
    setPdfPrinting(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", width: "0", height: "0", border: "none", visibility: "hidden" });
    const cleanup = () => { try { document.body.removeChild(iframe); } catch { /* already removed */ } URL.revokeObjectURL(url); };
    iframe.onload = () => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // Fallback: some browsers block programmatic print on embedded PDFs — open it instead.
        window.open(url, "_blank");
      }
      // The PDF print dialog is a native OS surface Playwright/JS can't observe
      // closing, so clean up the hidden iframe on a delay rather than waiting
      // for an event that won't fire reliably across browsers.
      setTimeout(cleanup, 60000);
    };
    document.body.appendChild(iframe);
    iframe.src = url;
  }

  async function handleShare(channel: "native" | "whatsapp" | "email" | "copy") {
    setShareOpen(false);
    if (!invoice) return;
    const num = invoice.invoiceNumber;
    const customer = invoice.customer.name;

    // Generate PDF for all channels — shared copies are always the Original
    // (the Duplicate is for the seller's own records, not for the customer).
    setShareLoadingText("Preparing PDF…");
    setShareLoading(true);
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY"]);
    setShareLoading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const file = new File([blob], `${num}.pdf`, { type: "application/pdf" });

    // Helper to trigger a PDF download.
    const downloadPdf = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${num}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    if (channel === "native") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Invoice ${num}` });
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
      setShareLoadingText("Sending email…");
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
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ type: "success", title: "Deleted", message: `Invoice moved to bin.` });
        router.push("/sales/invoices");
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
  if (error || !invoice) return <div className={`loading-center ${styles.errorText}`}>{error || "Invoice not found."}</div>;

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
      <PdfCopyDialog
        open={pdfCopyDialogOpen}
        loading={pdfDownloading}
        onConfirm={handleDownloadConfirm}
        onCancel={() => { if (!pdfDownloading) setPdfCopyDialogOpen(false); }}
      />
      {shareLoading && <OverlayLoader text={shareLoadingText} />}
      {pdfPrinting && <OverlayLoader text="Preparing PDF…" />}
      {addingPayment && <OverlayLoader text="Saving payment…" />}
      {addingReturn && <OverlayLoader text="Saving return…" />}

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
      `}</style>

      <div className="page-stack">
        {/* Toolbar */}
        <div className="page-header">
          <Breadcrumb items={[{ label: "Invoices", href: "/sales/invoices" }, { label: invoice.invoiceNumber }]} />
          <div className={styles.toolbarActions}>
            <StatusBadge status={invoice.status} />
            <Button variant="editOutline" size="sm" href={`/sales/invoices/edit/${id}`}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit Invoice</Button>
            {balance > 0 && (
              <Button
                variant="greenPrimary"
                size="sm"
                onClick={() => {
                  setPaymentForm({ amount: "", method: "Cash", reference: "" });
                  setShowPaymentForm(true);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Record Payment
              </Button>
            )}
            <span title={invoice.paidAmount <= 0 ? "No payment received yet — pay first to enable returns" : undefined} className={styles.inlineFlex}>
              <Button variant="secondary" size="sm" disabled={invoice.paidAmount <= 0} onClick={openReturnForm}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                Record Return
              </Button>
            </span>
            <Button variant="secondary" size="sm" onClick={handleDownloadClick}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print
            </Button>
            <Button variant="dangerOutline" size="sm" disabled={deleting} onClick={() => setDeleteConfirm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </Button>
            {/* Share PDF button */}
            <div className={styles.shareWrap} ref={shareContainerRef}>
              <Button variant="secondary" size="sm" disabled={shareLoading} onClick={() => {
                setShareOpen(o => {
                  const next = !o;
                  if (next && shareContainerRef.current) {
                    const rect = shareContainerRef.current.getBoundingClientRect();
                    const dropW = 240;
                    const viewW = window.innerWidth;
                    let right = viewW - rect.right;
                    // Ensure the dropdown's left edge stays ≥8px from viewport left
                    if (viewW - right - dropW < 8) right = viewW - dropW - 8;
                    right = Math.max(8, right);
                    setShareDropStyle({ position: "fixed", top: rect.bottom + 8, right });
                  }
                  return next;
                });
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.shareIconMargin}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Share PDF
              </Button>
              {shareOpen && (
                <>
                  <div className={styles.shareOverlay} onClick={() => setShareOpen(false)} />
                  <div className={styles.shareMenu} style={shareDropStyle}>
                    <div className={styles.shareMenuTitle}>Share PDF</div>
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
                    ] as const).filter(Boolean).map((opt) => (
                      <button
                        key={opt!.key}
                        onClick={() => handleShare(opt!.key as "native" | "whatsapp" | "email" | "copy")}
                        className={styles.shareMenuItem}
                      >
                        <span className={styles.shareMenuItemIcon} style={{ color: opt!.color }}>{opt!.icon}</span>
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
          <div className={`card ${styles.paymentFormCard}`}>
            <h3 className={styles.paymentFormTitle}>Record Payment</h3>
            <form onSubmit={handleAddPayment}>
              <div className={styles.paymentFormRow}>
                <FormField label="Amount (₹)">
                  <div className={styles.paymentAmountRow}>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={paymentForm.amount}
                      onChange={(e) => { setPaymentForm((p) => ({ ...p, amount: e.target.value })); }}
                      placeholder={`e.g. ${balance.toFixed(2)}`}
                      sz="sm"
                      className={styles.paymentAmountInput}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setPaymentForm((p) => ({ ...p, amount: balance.toFixed(2) }))}
                      className={styles.paymentFullBtn}
                    >
                      Full ₹{fmt(balance)}
                    </button>
                  </div>
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
                    className={styles.paymentReferenceInput}
                  />
                </FormField>
                <div className={styles.paymentFormBtnRow}>
                  <Button type="submit" variant="greenPrimary" size="sm" disabled={addingPayment} loading={addingPayment}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    Save Payment
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setShowPaymentForm(false); }} disabled={addingPayment}>Cancel</Button>
                </div>
              </div>
              <p className={styles.paymentBalanceHint}>
                Balance due: ₹{fmt(balance)}
              </p>
            </form>
          </div>
        )}

        {/* Return form modal */}
        {showReturnForm && (
          <div className={styles.returnModalOverlayWrap}>
            <div className={styles.returnModalBackdrop} onClick={() => { if (!addingReturn) setShowReturnForm(false); }} />
            <div className={styles.returnModalBox}>
              {/* Modal header */}
              <div className={styles.returnModalHeader}>
                <div className={styles.returnModalHeaderLeft}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                  <h3 className={styles.returnModalTitle}>Record Return</h3>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!addingReturn) setShowReturnForm(false); }}
                  disabled={addingReturn}
                  className={styles.returnModalCloseBtn}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {/* Modal body */}
              <div className={styles.returnModalBody}>
                <form onSubmit={handleAddReturn}>
                  <div className={styles.returnModalMetaRow}>
                    <div>
                      <label className={styles.returnModalFieldLabel}>Return Date</label>
                      <Input type="date" sz="sm" value={returnDate} onChange={e => setReturnDate(e.target.value)} className={styles.returnDateInput} />
                    </div>
                    <div className={styles.returnNotesField}>
                      <label className={styles.returnModalFieldLabel}>Notes</label>
                      <Input type="text" sz="sm" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Optional reason" className={styles.returnNotesInput} />
                    </div>
                  </div>
                  <div className={styles.returnItemsSection}>
                    <div className={styles.returnItemsLabel}>Select Items to Return</div>
                    <div className={styles.returnItemsList}>
                      {returnItems.map((ri, idx) => (
                        <div key={idx} className={`${styles.returnItemRow} ${ri.selected ? styles.returnItemRowSelected : ""}`}>
                          <input
                            type="checkbox"
                            checked={ri.selected}
                            onChange={e => {
                              const checked = e.target.checked;
                              setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, selected: checked } : r));
                              if (checked) setTimeout(() => returnQtyRefs.current[idx]?.focus(), 0);
                            }}
                            className={styles.returnItemCheckbox}
                          />
                          <span className={styles.returnItemName}>{ri.name}</span>
                          <span className={styles.returnItemMax}>max {ri.maxQty}</span>
                          <Input
                            ref={el => { returnQtyRefs.current[idx] = el; }}
                            type="number"
                            sz="sm"
                            value={ri.qtyText}
                            placeholder={String(ri.qty)}
                            disabled={!ri.selected}
                            onFocus={() => {
                              setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, qtyText: "" } : r));
                            }}
                            onChange={e => {
                              const raw = e.target.value.replace(/\D/g, "");
                              if (raw === "") { setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, qtyText: "" } : r)); return; }
                              const clamped = String(Math.min(ri.maxQty, parseInt(raw, 10)));
                              if (clamped === ri.qtyText) { e.target.value = clamped; return; }
                              setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, qtyText: clamped } : r));
                            }}
                            onBlur={() => {
                              const num = parseInt(ri.qtyText, 10);
                              const clamped = isNaN(num) || num < 1 ? 1 : Math.min(ri.maxQty, num);
                              setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, qty: clamped, qtyText: String(clamped) } : r));
                            }}
                            className={styles.returnItemQtyInput}
                          />
                        </div>
                      ))}
                      {returnItems.length === 0 && (
                        <p className={styles.returnItemsEmpty}>All items from this invoice have already been returned.</p>
                      )}
                    </div>
                  </div>
                  {/* Modal footer */}
                  <div className={styles.returnModalFooter}>
                    <Button type="submit" variant="primary" size="sm" disabled={addingReturn || returnItems.length === 0} loading={addingReturn}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                      Save Return
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => { if (!addingReturn) setShowReturnForm(false); }} disabled={addingReturn}>Cancel</Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Invoice print area */}
        <div id="invoice-print-area"
          style={{ background: "var(--inv-bg)", color: "var(--inv-tx)", borderRadius: "0.75rem", boxShadow: "var(--c-shadow-sm)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              {/* ── Letterhead header ── */}
              <thead>
                <tr>
                  <th colSpan={invoice.isInterState ? 9 : 10}
                    style={{ position:"relative", border:"1px solid var(--inv-bd)", padding:"14px 20px",
                      textAlign:"center", background:"var(--inv-bg)", fontWeight:"normal" }}>
                    {/* Populated + shown only during PDF generation / printing.
                        data-role survives node cloning (ids get stripped there). */}
                    <div id="invoice-copy-badge" data-role="copy-badge" style={{ display:"none", position:"absolute", top:10, right:14,
                      fontSize:9, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase",
                      color:"var(--inv-tx2)", border:"1px solid var(--inv-bd)", borderRadius:4, padding:"3px 9px" }} />
                    <div style={{ fontSize:10, textDecoration:"underline", letterSpacing:"0.2em",
                      textTransform:"uppercase", color:"var(--inv-tx3)", marginBottom:5 }}>
                      Tax Invoice
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, letterSpacing:"0.04em",
                      textTransform:"uppercase", color:"var(--inv-tx)", marginBottom:4, lineHeight:1.2 }}>
                      {settings?.name}
                    </div>
                    {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
                      <div style={{ fontSize:11, color:"var(--inv-tx2)", marginBottom:2 }}>
                        {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {settings?.tagline && (
                      <div style={{ fontSize:11, color:"var(--inv-tx2)", marginBottom:2 }}>{settings.tagline}</div>
                    )}
                    {(settings?.phone || settings?.email) && (
                      <div style={{ fontSize:11, color:"var(--inv-tx2)", display:"flex",
                        justifyContent:"center", gap:24, flexWrap:"wrap", marginBottom:2 }}>
                        {settings?.phone && <span>Tel. : {settings.phone}</span>}
                        {settings?.email && <span>email : {settings.email}</span>}
                      </div>
                    )}
                    {settings?.gstin && (
                      <div style={{ fontSize:11, color:"var(--inv-tx2)", fontFamily:"monospace" }}>
                        GSTIN : {settings.gstin}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* ── Invoice meta ── */}
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,whiteSpace:"nowrap",background:"var(--inv-bg2)" }}>Invoice No.</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",fontWeight:700,color:"var(--inv-tx)" }}>{invoice.invoiceNumber}</td>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,whiteSpace:"nowrap",background:"var(--inv-bg2)" }}>Invoice Date</td>
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                    {new Date(invoice.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true})}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Created By</td>
                  <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                    {invoice.createdBy?.name ?? "—"}
                  </td>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Supply Type</td>
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",
                    color:invoice.isInterState ? "var(--inv-blue)" : "var(--inv-green)", fontWeight:600 }}>
                    {invoice.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}
                  </td>
                </tr>
                {invoice.dueDate && (
                  <tr>
                    <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx3)",fontWeight:600,background:"var(--inv-bg2)" }}>Due Date</td>
                    <td colSpan={3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)" }}>
                      {new Date(invoice.dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                    </td>
                    <td colSpan={invoice.isInterState ? 4 : 5} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px" }} />
                  </tr>
                )}

                {/* ── Buyer: Bill To / Ship To ── */}
                <tr>
                  <td colSpan={5}
                    style={{ border:"1px solid var(--inv-bd)", padding:0, verticalAlign:"top" }}>
                    <div style={{ background:"var(--inv-bg3)", padding:"5px 14px", fontSize:11, fontWeight:700,
                      color:"var(--inv-tx2)", borderBottom:"1px solid var(--inv-bd)" }}>
                      Buyer (Bill to)
                    </div>
                    <div style={{ padding:"10px 14px", lineHeight:1.75, fontSize:12 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"var(--inv-tx)", marginBottom:2 }}>
                        {invoice.customer.name}
                      </div>
                      {invoice.customer.address && (
                        <div style={{ color:"var(--inv-tx2)" }}>{invoice.customer.address}</div>
                      )}
                      {(invoice.customer.city || invoice.customer.state) && (
                        <div style={{ color:"var(--inv-tx2)" }}>
                          {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {invoice.customer.pincode && (
                        <div style={{ color:"var(--inv-tx2)" }}>{invoice.customer.pincode}</div>
                      )}
                      {(invoice.customer.phone || invoice.customer.email) && (
                        <div style={{ color:"var(--inv-tx3)", marginTop:2 }}>
                          {[invoice.customer.phone && `Ph: ${invoice.customer.phone}`,
                            invoice.customer.email && `Email: ${invoice.customer.email}`]
                            .filter(Boolean).join("  |  ")}
                        </div>
                      )}
                      <div style={{ marginTop:6, borderTop:"1px solid var(--inv-bd)", paddingTop:5 }}>
                        {invoice.customer.state && (
                          <div style={{ fontWeight:600, color:"var(--inv-tx)", fontSize:11 }}>
                            Place of Supply : {invoice.customer.state}
                          </div>
                        )}
                        {invoice.customer.gstin && (
                          <div style={{ fontWeight:600, color:"var(--inv-tx)", fontSize:11 }}>
                            GST Number : {invoice.customer.gstin}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td colSpan={invoice.isInterState ? 4 : 5}
                    style={{ border:"1px solid var(--inv-bd)", padding:0, verticalAlign:"top" }}>
                    <div style={{ background:"var(--inv-bg3)", padding:"5px 14px", fontSize:11, fontWeight:700,
                      color:"var(--inv-tx2)", borderBottom:"1px solid var(--inv-bd)" }}>
                      Buyer (Ship to)
                    </div>
                    <div style={{ padding:"10px 14px", lineHeight:1.75, fontSize:12 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"var(--inv-tx)", marginBottom:2 }}>
                        {invoice.customer.name}
                      </div>
                      {invoice.customer.address && (
                        <div style={{ color:"var(--inv-tx2)" }}>{invoice.customer.address}</div>
                      )}
                      {(invoice.customer.city || invoice.customer.state) && (
                        <div style={{ color:"var(--inv-tx2)" }}>
                          {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {invoice.customer.pincode && (
                        <div style={{ color:"var(--inv-tx2)" }}>{invoice.customer.pincode}</div>
                      )}
                      {(invoice.customer.phone || invoice.customer.email) && (
                        <div style={{ color:"var(--inv-tx3)", marginTop:2 }}>
                          {[invoice.customer.phone && `Ph: ${invoice.customer.phone}`,
                            invoice.customer.email && `Email: ${invoice.customer.email}`]
                            .filter(Boolean).join("  |  ")}
                        </div>
                      )}
                      <div style={{ marginTop:6, borderTop:"1px solid var(--inv-bd)", paddingTop:5 }}>
                        {invoice.customer.state && (
                          <div style={{ fontWeight:600, color:"var(--inv-tx)", fontSize:11 }}>
                            Place of Supply : {invoice.customer.state}
                          </div>
                        )}
                        {invoice.customer.gstin && (
                          <div style={{ fontWeight:600, color:"var(--inv-tx)", fontSize:11 }}>
                            GST Number : {invoice.customer.gstin}
                          </div>
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
                  <td colSpan={5} rowSpan={invoice.isInterState ? 6 : 7}
                    style={{ border:"1px solid var(--inv-bd)",padding:"14px 16px",verticalAlign:"top",color:"var(--inv-tx3)" }}>
                    <div style={{ display:"flex",flexDirection:"column",height:"100%",minHeight:120 }}>
                      <div style={{ marginTop:"auto" }}>
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontWeight:700,textTransform:"uppercase",fontSize:11,marginBottom:4,color:"var(--inv-tx2)" }}>Terms &amp; Conditions</div>
                          <ol style={{ margin:0,paddingLeft:14,fontSize:10.5,lineHeight:1.5 }}>
                            <li>Interest @ 24%p.a would be charged after 45 days of Invoice</li>
                            <li>Material sold strictly for lab use only</li>
                            <li>We are not responsible for any loss in transit.</li>
                            <li>Subject to &apos;Delhi&apos; Jurisdiction only.</li>
                          </ol>
                        </div>
                        {invoice.notes && (
                          <><div style={{ fontWeight:700,textTransform:"uppercase",fontSize:11,marginBottom:4,color:"var(--inv-tx2)" }}>Notes</div><p>{invoice.notes}</p></>
                        )}
                        <p style={{ marginTop:10,fontSize:11,opacity:0.55 }}>This is a computer-generated invoice.</p>
                        <div style={{ marginTop:16,borderTop:"1px solid var(--inv-bd2)",paddingTop:8 }}>
                          <div style={{ fontSize:11,fontWeight:600,color:"var(--inv-tx2)",marginBottom:20 }}>For {settings?.name}</div>
                          <div style={{ fontSize:10,color:"var(--inv-tx3)" }}>Authorised Signatory</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>Subtotal</td>
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.subtotal)}</td>
                </tr>
                {invoice.isInterState ? (
                  <tr>
                    <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>IGST</td>
                    <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-tx2)",background:"var(--inv-bg2)" }}>₹{fmt(invoice.igst)}</td>
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
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",textAlign:"right",fontWeight:700,color:"var(--inv-tx)",background:"var(--inv-bg4)",fontSize:13 }}>₹{fmt(invoice.total)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",color:"var(--inv-green)",background:"var(--inv-bg2)" }}>Paid</td>
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"8px 14px",textAlign:"right",color:"var(--inv-green)",fontWeight:600,background:"var(--inv-bg2)" }}>₹{fmt(invoice.paidAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",fontWeight:700,color:"var(--inv-tx)",background:"var(--inv-bg3)" }}>Balance Due</td>
                  <td colSpan={invoice.isInterState ? 2 : 3} style={{ border:"1px solid var(--inv-bd)",padding:"9px 14px",textAlign:"right",fontWeight:700,fontSize:14,background:"var(--inv-bg3)",
                    color: balance > 0 ? "var(--inv-red)" : "var(--inv-green)" }}>₹{fmt(balance)}</td>
                </tr>

              </tbody>

              {/* PDF payment history — direct rows in main table to avoid double borders */}
              {showPaymentInPdf && invoice.payments.length > 0 && (() => {
                const sorted = [...invoice.payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                const allCols = invoice.isInterState ? 9 : 10;
                // Reference/UTR and Amount columns are sized so the divider between
                // them lands on the same underlying column boundary as the Grand
                // Total / Balance Due label|value divider above — the notes cell
                // (colSpan 5, fixed for both supply types) plus the label (colSpan 2)
                // always puts that divider after 7 real columns, so Date+Method+Ref
                // must also total 7 in both states; Amount absorbs the 1-column
                // difference between inter-state (9 total) and intra-state (10).
                const refCols = 3;
                const amountCols = invoice.isInterState ? 2 : 3;
                const bd: React.CSSProperties = { border: "1px solid var(--inv-bd)", padding: "5px 10px", fontSize: 11 };
                return (
                  <tbody>
                    <tr>
                      <td colSpan={allCols} style={{ ...bd, padding: "7px 14px", background: "var(--inv-bg3)", color: "var(--inv-tx)", fontWeight: 700, fontSize: 12 }}>
                        Payment History
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Date &amp; Time</td>
                      <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Method</td>
                      <td colSpan={refCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Reference / UTR</td>
                      <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Amount (₹)</td>
                    </tr>
                    {sorted.map((p) => (
                      <tr key={p.id}>
                        <td colSpan={2} style={{ ...bd, color: "var(--inv-tx2)" }}>
                          {new Date(p.date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                        </td>
                        <td colSpan={2} style={{ ...bd, color: "var(--inv-tx2)" }}>{p.method}</td>
                        <td colSpan={refCols} style={{ ...bd, color: "var(--inv-tx2)" }}>{p.reference || "—"}</td>
                        <td colSpan={amountCols} style={{ ...bd, textAlign: "right", color: "var(--inv-green)", fontWeight: 600 }}>{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })()}

              {showReturnInPdf && returns.length > 0 && (() => {
                const allCols = invoice.isInterState ? 9 : 10;
                // Column widths are tuned so two dividers line up with the tables
                // above: Item|Qty×Rate lands on the same column boundary as the
                // Grand Total/Balance Due label|value split (the notes cell is now
                // always colSpan 5), and Qty×Rate|Amount lands on the same boundary
                // as Payment History's Reference|Amount divider (also now fixed,
                // since both boundaries above are fixed for both supply types).
                const itemCols = 3;
                const qtyRateCols = 2;
                const amountCols = invoice.isInterState ? 2 : 3;
                const bd: React.CSSProperties = { border: "1px solid var(--inv-bd)", padding: "5px 10px", fontSize: 11 };
                return (
                  <tbody>
                    <tr>
                      <td colSpan={allCols} style={{ ...bd, padding: "7px 14px", background: "var(--inv-bg3)", color: "var(--inv-tx)", fontWeight: 700, fontSize: 12 }}>
                        Return History
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Date &amp; Time</td>
                      <td colSpan={itemCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Item</td>
                      <td colSpan={qtyRateCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600 }}>Qty × Rate</td>
                      <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Amount (₹)</td>
                    </tr>
                    {returns.map((ret) =>
                      ret.items.map((ri, riIdx) => (
                        <tr key={`${ret.id}-${ri.id}`}>
                          {riIdx === 0 && (
                            <td colSpan={2} rowSpan={ret.items.length} style={{ ...bd, color: "var(--inv-tx2)", verticalAlign: "top" }}>
                              {parseDate(ret.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                              {ret.notes ? <div style={{ fontSize: 10, color: "var(--inv-tx3)", marginTop: 2 }}>{ret.notes}</div> : null}
                            </td>
                          )}
                          <td colSpan={itemCols} style={{ ...bd, color: "var(--inv-tx2)" }}>{ri.name}</td>
                          <td colSpan={qtyRateCols} style={{ ...bd, color: "var(--inv-tx3)" }}>{ri.quantity} × ₹{fmt(ri.price)}</td>
                          <td colSpan={amountCols} style={{ ...bd, textAlign: "right", color: "var(--inv-red)", fontWeight: 600 }}>−{fmt(ri.total)}</td>
                        </tr>
                      ))
                    )}
                    <tr>
                      <td colSpan={allCols - amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-tx2)", fontWeight: 600, textAlign: "right" }}>Total Returned</td>
                      <td colSpan={amountCols} style={{ ...bd, background: "var(--inv-bg2)", color: "var(--inv-red)", fontWeight: 700, textAlign: "right" }}>
                        −{fmt(returns.reduce((s, r) => s + r.items.reduce((ss, ri) => ss + ri.total, 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                );
              })()}

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
        {invoice.payments.length > 0 && (() => {
          const METHOD_STYLE: Record<string, { bg: string; color: string; border: string }> = {
            Cash:    { bg:"var(--c-green-bg)",   color:"var(--c-green-text)",  border:"var(--c-green-border)" },
            UPI:     { bg:"#f3e8ff",              color:"#7c3aed",              border:"#ddd6fe" },
            NEFT:    { bg:"var(--c-blue-bg)",     color:"var(--c-blue)",        border:"var(--c-blue-border)" },
            RTGS:    { bg:"var(--c-blue-bg)",     color:"var(--c-blue)",        border:"var(--c-blue-border)" },
            Cheque:  { bg:"var(--c-amber-bg)",    color:"var(--c-amber)",       border:"var(--c-amber-border)" },
            Card:    { bg:"#ede9fe",              color:"#5b21b6",              border:"#c4b5fd" },
            Other:   { bg:"var(--c-bg-sub)",      color:"var(--c-text-3)",      border:"var(--c-border)" },
          };
          const paidTotal = invoice.payments.reduce((s, p) => s + p.amount, 0);
          const totalReturned = returns.reduce((s, r) => s + r.items.reduce((ss, ri) => ss + ri.total, 0), 0);
          const netPaid = paidTotal - totalReturned;
          const paidPct = Math.min(100, (paidTotal / invoice.total) * 100);

          return (
            <div className="card">
              {/* Header */}
              <div className={styles.historyHeader}>
                {/* Left: title + count */}
                <div className={styles.historyHeaderLeft}>
                  <h2 className={styles.historyTitle}>Payment History</h2>
                  <span className={styles.historyCountBadge}>
                    {invoice.payments.length}
                  </span>
                </div>
                {/* Right: toggle + stats */}
                <div className={styles.historyHeaderRight}>
                  {/* Show in PDF toggle */}
                  <button
                    onClick={() => setShowPaymentInPdf(v => !v)}
                    title={showPaymentInPdf ? "Remove from PDF/Print" : "Include in PDF/Print"}
                    className={`${styles.pdfToggleBtn} ${showPaymentInPdf ? styles.pdfToggleBtnActive : ""}`}
                  >
                    {showPaymentInPdf ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                    {showPaymentInPdf ? "Remove Payment History from PDF" : "Add Payment History to PDF"}
                  </button>
                  {/* Stats group — separated visually */}
                  <div className={styles.historyStatsGroup}>
                    <div>
                      <div className={styles.historyStatLabel}>Total Paid</div>
                      <div className={`${styles.historyStatValue} ${styles.historyStatValueGreen}`}>₹{fmt(paidTotal)}</div>
                      {totalReturned > 0 && (
                        <div className={styles.historyNetLine}>
                          <span className={styles.historyNetLineOrange}>− ₹{fmt(totalReturned)}</span>
                          <span className={styles.historyNetLineNet}> = ₹{fmt(netPaid)}</span>
                          <span> net</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className={styles.historyStatLabel}>Balance</div>
                      <div className={styles.historyStatValue} style={{ color: balance > 0 ? "var(--c-red)" : "var(--c-green)" }}>₹{fmt(balance)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className={styles.progressRowWrap}>
                <div className={styles.progressRow}>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${paidPct}%`, background: paidPct >= 100 ? "var(--c-green)" : "var(--c-blue)" }} />
                  </div>
                  <span className={styles.progressLabel} style={{ color: paidPct >= 100 ? "var(--c-green-text)" : "var(--c-text-3)" }}>
                    {paidPct.toFixed(0)}% paid
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date &amp; Time</th>
                      <th>Method</th>
                      <th>Reference / UTR</th>
                      <th className="table-th-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...invoice.payments]
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((p, idx) => {
                        const ms = METHOD_STYLE[p.method] ?? METHOD_STYLE.Other;
                        return (
                          <tr key={p.id}>
                            <td className={styles.payIdxCell}>{idx + 1}</td>
                            <td data-label="Date & Time" className={styles.payDateCell}>
                              {new Date(p.date).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true })}
                            </td>
                            <td data-label="Method">
                              <span className={styles.methodBadge} style={{ background:ms.bg, color:ms.color, border:`1px solid ${ms.border}` }}>{p.method}</span>
                            </td>
                            <td data-label="Reference" className={styles.payReferenceCell}>
                              {p.reference || "—"}
                            </td>
                            <td data-label="Amount" className={`table-td-right ${styles.payAmountCell}`}>
                              ₹{fmt(p.amount)}
                            </td>
                          </tr>
                        );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Returns history */}
        {returns.length > 0 && (() => {
          const totalReturned = returns.reduce((s, r) => s + r.items.reduce((ss, ri) => ss + ri.total, 0), 0);
          return (
            <div className={`card ${styles.returnsHistoryCard}`}>
              <div className={styles.returnsHistoryHeader}>
                <div className={styles.returnsHistoryHeaderLeft}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                  <span className={styles.returnsHistoryTitle}>Return History</span>
                  <span className={styles.returnsCountBadge}>{returns.length}</span>
                </div>
                <div className={styles.historyHeaderRight}>
                  <button
                    onClick={() => setShowReturnInPdf(v => !v)}
                    title={showReturnInPdf ? "Remove from PDF/Print" : "Include in PDF/Print"}
                    className={`${styles.pdfToggleBtn} ${showReturnInPdf ? styles.pdfToggleBtnActive : styles.pdfToggleBtnOrange}`}
                  >
                    {showReturnInPdf ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                    {showReturnInPdf ? "Remove Return History from PDF" : "Add Return History to PDF"}
                  </button>
                  <div className={styles.returnsHistoryTotal}>₹{fmt(totalReturned)} returned</div>
                </div>
              </div>
              <div className={styles.returnsList}>
                {returns.map((ret, ridx) => (
                  <div key={ret.id} className={ridx < returns.length - 1 ? styles.returnEntry : styles.returnEntryLast}>
                    <div className={styles.returnEntryHead}>
                      <div className={styles.returnEntryHeadLeft}>
                        <span className={styles.returnEntryDate}>
                          {parseDate(ret.createdAt).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true })}
                        </span>
                        {ret.notes && <span className={styles.returnEntryNotes}>— {ret.notes}</span>}
                      </div>
                      <span className={styles.returnEntryTotal}>
                        ₹{fmt(ret.items.reduce((s, ri) => s + ri.total, 0))}
                      </span>
                    </div>
                    <div className={styles.returnItemsGroup}>
                      {ret.items.map(ri => (
                        <div key={ri.id} className={styles.returnLineItem}>
                          <span className={styles.returnLineItemName}>
                            {ri.name}
                            <span className={styles.returnLineItemQty}> ×{ri.quantity}</span>
                            <span className={styles.returnLineItemPrice}> @ ₹{fmt(ri.price)}</span>
                          </span>
                          <span className={styles.returnLineItemTotal}>₹{fmt(ri.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
