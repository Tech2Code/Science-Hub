"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { Input, Select, FormField } from "@/components/ui/Input";
import { FillMaxButton } from "@/components/ui/FillMaxButton";
import { StatusBadge } from "@/components/ui/Badge";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Sk } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { rules, validate } from "@/lib/validation";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { getCachedPdf, setCachedPdf, invalidateCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { amountInWordsINR } from "@/lib/numberToWords";
import { animateSection } from "@/lib/animateSection";
import { truncateFilename } from "@/lib/truncateFilename";
import { AttachmentIcon } from "@/components/purchases/AttachmentIcon";
import { useCanWrite } from "@/lib/useCanWrite";
import { formatDate } from "@/lib/formatDate";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useMenuA11y } from "@/lib/useMenuA11y";
import styles from "./billDetail.module.css";

interface PurchaseBillItem {
  id: string; name: string; hsn: string; unit: string; quantity: number;
  purchasePrice: number; discountPercent: number; discountAmount: number; gstRate: number; gstAmount: number; total: number;
  product: { id: string; name: string } | null;
}
interface PurchasePayment {
  id: string; amount: number; method: string; reference: string | null; date: string; notes: string | null;
}
interface PurchaseBill {
  id: string; billNumber: string; billDate: string; dueDate: string | null; createdAt: string;
  status: string; category: string | null; notes: string | null;
  subtotal: number; taxAmount: number; isInterState: boolean; placeOfSupply: string | null;
  cgst: number; sgst: number; igst: number;
  transportCharge?: number; transportChargeGstRate?: number; transportChargeGstAmount?: number;
  discount: number; total: number; roundOff: number; paidAmount: number;
  vendor: { id: string; name: string; company: string | null; gstin: string | null; phone: string | null; email: string | null; address: string | null; state: string | null; updatedAt?: string; };
  createdBy: { id: string; name: string };
  items: PurchaseBillItem[];
  payments: PurchasePayment[];
  attachmentUrl: string | null;
  attachmentName: string | null;
}
interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string;
  updatedAt?: string;
}

const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];
const fmt     = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function StatCard({ label, value, color = "var(--c-text)", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoRowLabel}>{label}</span>
      <span className={`${styles.infoRowValue} ${mono ? styles.infoRowValueMono : ""}`}>{value}</span>
    </div>
  );
}

export default function PurchaseBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast   = useToast();
  const router  = useRouter();
  const canWrite = useCanWrite();
  const paymentIdempotency = useIdempotencyKey();

  const [bill,    setBill]    = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [openingEdit, setOpeningEdit] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfViewing, setPdfViewing] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareDropStyle, setShareDropStyle] = useState<CSSProperties>({});
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  useMenuA11y(shareOpen, () => setShareOpen(false), shareMenuRef);

  // Vendor's own email pre-fills the field so it can be selected directly
  // instead of retyped, but stays editable/extendable — a bill may need to
  // go to more than one recipient (e.g. vendor + their accountant), so the
  // field accepts a comma-separated list.
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToError, setEmailToError] = useState<string | undefined>(undefined);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  // Payment form
  const [showPayForm, setShowPayForm]   = useState(false);
  const [payAmount,   setPayAmount]     = useState("");
  const [payAmountError, setPayAmountError] = useState<string | undefined>(undefined);
  const [payMethod,   setPayMethod]     = useState("Cash");
  const [payRef,      setPayRef]        = useState("");
  const [payDate,     setPayDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting,  setSubmitting]    = useState(false);

  function resetPaymentForm() {
    setPayAmount("");
    setPayAmountError(undefined);
    setPayMethod("Cash");
    setPayRef("");
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  const [updatingStatus] = useState(false);
  const [confirmCancel,  setConfirmCancel]  = useState(false);
  const [cancelling,     setCancelling]     = useState(false);
  const [confirmUncancel, setConfirmUncancel] = useState(false);
  const [uncancelling,    setUncancelling]    = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/purchase-bills/${id}`)
      // A non-2xx response (e.g. a deleted/invalid bill id) still parses as valid JSON — without
      // this check, the {error: "..."} body would silently be treated as the bill itself, pass
      // the `if (error || !bill)` guard below (bill would be truthy), and crash the render on
      // the many unguarded bill.vendor.* accesses.
      .then(r => { if (!r.ok) throw new Error("Bill not found."); return r.json(); })
      .then(d => { setBill(d); setLoading(false); })
      .catch(() => { setError("Failed to load purchase bill."); setLoading(false); });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-id-change; load() sets loading/bill state
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(setSettings).catch(() => {});
  }, []);

  async function generateBillPdfBlob(force: boolean): Promise<Blob | null> {
    if (!bill) return null;
    const variantKey = buildPdfVariantKey(undefined, {
      settings: settings?.updatedAt ?? "loading",
      vendor: bill.vendor?.updatedAt ?? "loading",
    });
    let blob = force ? null : await getCachedPdf("purchase-bill", bill.id, variantKey);
    if (!blob) {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;
      const el = document.getElementById("bill-print-area");
      blob = el ? await generateInvoicePdfBlob(el) : null;
      if (blob) setCachedPdf("purchase-bill", bill.id, variantKey, blob);
    }
    return blob;
  }

  async function handleDownloadPdf(force = false) {
    if (!bill) return;
    setPdfDownloading(true);
    const blob = await generateBillPdfBlob(force);
    setPdfDownloading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${bill.billNumber}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (force) toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
  }

  async function handleViewPdf() {
    if (!bill) return;
    setPdfViewing(true);
    const blob = await generateBillPdfBlob(false);
    setPdfViewing(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
  }

  async function handleShare(channel: "native" | "whatsapp" | "email") {
    setShareOpen(false);
    if (!bill) return;
    const num = bill.billNumber;

    if (channel === "email") {
      setEmailTo(bill.vendor.email ?? "");
      setEmailToError(undefined);
      setEmailModalOpen(true);
      return;
    }

    setShareLoading(true);
    const blob = await generateBillPdfBlob(false);
    setShareLoading(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const file = new File([blob], `${num}.pdf`, { type: "application/pdf" });

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
          await navigator.share({ files: [file], title: `Purchase Bill ${num}` });
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
          await navigator.share({ files: [file], title: `Purchase Bill ${num}`, text: `Purchase Bill ${num} — ₹${fmt(bill.total)}` });
        } catch (err) {
          if ((err as Error).name !== "AbortError") toast({ type: "error", title: "Share failed", message: "Could not open share sheet." });
        }
      } else {
        toast({ type: "error", title: "Not supported", message: "File sharing is not supported on this browser." });
      }
      return;
    }
  }

  // Splits the comma-separated recipient field into individual addresses so
  // a bill can be sent to more than one email (e.g. vendor + their
  // accountant) in a single send, mirroring how the server itself validates
  // and forwards the list to nodemailer's `to`.
  function parseEmailList(raw: string): string[] {
    return raw.split(",").map(e => e.trim()).filter(Boolean);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!bill) return;
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
      const blob = await generateBillPdfBlob(false);
      if (!blob) {
        toast({ type: "error", title: "Failed", message: "Could not generate PDF." });
        setSendingEmail(false);
        return;
      }
      const formData = new FormData();
      formData.append("pdf", blob, `${bill.billNumber}.pdf`);
      formData.append("to", emails.join(","));
      formData.append("billNumber", bill.billNumber);
      formData.append("vendorName", bill.vendor.name);
      formData.append("total", fmt(bill.total));
      const res = await fetch("/api/send-purchase-bill", { method: "POST", body: formData });
      if (res.ok) {
        toast({ type: "success", title: "Email sent", message: `Purchase Bill ${bill.billNumber} sent to ${emails.join(", ")}` });
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

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!bill) return;
    const amount  = parseFloat(payAmount);
    const balance = bill.total - bill.paidAmount;
    if (!payAmount || isNaN(amount) || amount <= 0) { setPayAmountError("Enter a valid amount."); return; }
    if (amount > balance + 0.01) { setPayAmountError(`Amount exceeds outstanding balance of ₹${fmt(balance)}.`); return; }
    setPayAmountError(undefined);
    if (payDate < bill.billDate.slice(0, 10)) { toast({ type: "error", title: "Check form", message: "Payment date cannot be before the bill date." }); return; }
    if (payDate > new Date().toISOString().slice(0, 10)) { toast({ type: "error", title: "Check form", message: "Payment date cannot be in the future." }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method: payMethod, reference: payRef.trim() || null, date: payDate, idempotencyKey: paymentIdempotency.key() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        paymentIdempotency.renew(); // this dialog can be reopened for another payment — a fresh key must back the next submit
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/reports");
        bustCachePrefix("/api/purchase-reports");
        invalidateCachedPdf("purchase-bill", id);
        toast({ type: "success", title: "Payment recorded", message: `₹${fmt(amount)} via ${payMethod}.` });
        setShowPayForm(false);
        resetPaymentForm();
        load();
      } else {
        toast({ type: "error", title: "Failed", message: data.error ?? "Failed to record payment." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSubmitting(false);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/products");
        bustCachePrefix("/api/reports");
        bustCachePrefix("/api/purchase-reports");
        invalidateCachedPdf("purchase-bill", id);
        toast({ type: "success", title: "Bill cancelled", message: "Status updated to cancelled." });
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d.error ?? "Could not cancel bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setCancelling(false);
    setConfirmCancel(false);
  }

  async function handleUncancel() {
    setUncancelling(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "unpaid" }), // any non-"cancelled" value — the server recomputes the real status from paidAmount vs total
      });
      if (res.ok) {
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/products");
        bustCachePrefix("/api/reports");
        bustCachePrefix("/api/purchase-reports");
        invalidateCachedPdf("purchase-bill", id);
        toast({ type: "success", title: "Bill un-cancelled", message: "Status restored." });
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d.error ?? "Could not un-cancel bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setUncancelling(false);
    setConfirmUncancel(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/purchase-bills/${id}`, { method: "DELETE" });
      if (res.ok) {
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/products");
        bustCachePrefix("/api/reports");
        bustCachePrefix("/api/purchase-reports");
        invalidateCachedPdf("purchase-bill", id);
        toast({ type: "success", title: "Deleted", message: "Purchase bill moved to bin." });
        router.push("/purchases/bills");
        // No setDeleting(false)/setConfirmDelete(false) here — page is navigating away; resetting
        // first would briefly re-enable Delete mid-transition and allow a duplicate delete click.
        return;
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Delete failed", message: d.error ?? "Could not delete purchase bill." });
      }
    } catch {
      toast({ type: "error", title: "Delete failed", message: "Network error." });
    }
    setDeleting(false);
    setConfirmDelete(false);
  }

  if (loading) return (
    <div className={`page-stack ${styles.pageStack}`}>
      {/* Toolbar */}
      <div className={styles.toolbarRow}>
        <div>
          <Sk w={160} h={12} r={3} />
        </div>
        <div className={styles.toolbarActions}>
          <Sk w={70} h={20} r={9999} />
          <Sk w={90} h={30} r={6} />
          <Sk w={140} h={30} r={6} />
          <Sk w={70} h={30} r={6} />
          <Sk w={110} h={30} r={6} />
          <Sk w={100} h={30} r={6} />
          <Sk w={90} h={30} r={6} />
          <Sk w={80} h={30} r={6} />
        </div>
      </div>

      {/* KPI stat strip */}
      <div className={styles.statStrip}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.statCard}>
            <Sk w={60} h={10} r={3} />
            <Sk w={80} h={18} r={3} />
          </div>
        ))}
      </div>

      {/* Info cards: Vendor | Bill Meta — matches the real `card infoCard` padding */}
      <div className={styles.infoGrid}>
        {/* Vendor — name link + company line + a few contact-detail lines,
            not label:value rows (that shape belongs to the Bill Info card below). */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.skLabelGap}><Sk w={60} h={10} r={3} /></div>
          <div className={styles.skNameGap}><Sk w={140} h={16} r={3} /></div>
          <div className={styles.skCompanyGap}><Sk w={100} h={13} r={3} /></div>
          <div className={`${styles.vendorDetails} ${styles.skDetailsGap}`}>
            <Sk w={160} h={12} r={3} />
            <Sk w={120} h={12} r={3} />
            <Sk w={140} h={12} r={3} />
          </div>
        </div>

        {/* Bill Information — label:value rows */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.skLabelGap}><Sk w={60} h={10} r={3} /></div>
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className={styles.infoRow}>
              <Sk w={70} h={11} r={3} />
              <Sk w={100} h={11} r={3} />
            </div>
          ))}
        </div>
      </div>

      {/* Items table — mirrors the #/Item/Qty/Rate/Discount/GST %/GST Amt/Total columns below.
          Header uses the real sectionHeaderRow (1rem/1.25rem padding + divider); rows use the
          same 0.75rem/1rem padding as the real table's <td>, so nothing sits flush on the card edge. */}
      <div className="card">
        <div className={styles.sectionHeaderRow}>
          <Sk w={80} h={14} r={3} />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skTableRow}>
            <Sk w={20} h={12} r={3} />
            <Sk w="20%" h={12} r={3} />
            <Sk w="9%" h={12} r={3} />
            <Sk w="7%" h={12} r={3} />
            <Sk w="10%" h={12} r={3} />
            <Sk w="10%" h={12} r={3} />
            <Sk w="8%" h={12} r={3} />
            <Sk w="10%" h={12} r={3} />
            <Sk w="10%" h={12} r={3} />
          </div>
        ))}
      </div>

      {/* Payment history table */}
      <div className="card">
        <div className={styles.sectionHeaderRow}>
          <Sk w={140} h={14} r={3} />
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.skTableRow}>
            <Sk w="20%" h={12} r={3} />
            <Sk w="20%" h={12} r={3} />
            <Sk w="30%" h={12} r={3} />
            <Sk w="15%" h={12} r={3} />
          </div>
        ))}
      </div>
    </div>
  );
  if (error || !bill) return <div className={`error-banner ${styles.errorBanner}`}>{error || "Bill not found."}</div>;

  const balance   = bill.total - bill.paidAmount;
  const isOverdue = bill.status !== "paid" && bill.status !== "cancelled" && bill.dueDate && new Date(bill.dueDate) < new Date();

  return (
    <>
    {(submitting || updatingStatus || cancelling || uncancelling) && <OverlayLoader text="Saving…" />}
    {deleting && <OverlayLoader text="Deleting…" />}
    {openingEdit && <OverlayLoader text="Opening editor…" />}
    {pdfDownloading && <OverlayLoader text="Generating PDF…" />}
    {pdfViewing && <OverlayLoader text="Preparing PDF…" />}
    {shareLoading && <OverlayLoader text="Preparing PDF…" />}
    {sendingEmail && <OverlayLoader text="Sending email…" />}

    {pdfPreviewUrl && (
      <PdfPreviewModal
        url={pdfPreviewUrl}
        fileName={bill.billNumber}
        title={bill.billNumber}
        subtitle={bill.vendor.name}
        onClose={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
      />
    )}

    <style>{`
      #bill-print-area {
        --bp-bg:#fff; --bp-bg2:#f8fafc; --bp-bg3:#f1f5f9; --bp-bg4:#e2e8f0;
        --bp-bd:#475569; --bp-tx:#0f172a; --bp-tx2:#334155; --bp-tx3:#64748b;
      }
    `}</style>

    {/* overflowWrap inherits down to every field (vendor/business address,
        GSTIN, etc.) so a long unbreakable token wraps instead of spilling
        past this fixed 794px width — which html2canvas would otherwise
        capture as content bleeding outside the page during PDF generation.
        The vendor-name div overrides this locally with nowrap + ellipsis,
        which still wins for that single line. */}
    <div id="bill-print-area" style={{ position: "fixed", left: -9999, top: 0, width: 794, background: "var(--bp-bg)", color: "var(--bp-tx)", padding: "20px 14px", fontFamily: "Arial, sans-serif", overflowWrap: "break-word", wordBreak: "break-word" }} aria-hidden="true">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, borderBottom: `2px solid var(--bp-bd)`, paddingBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--bp-tx)" }}>{settings?.name || "Science Hub"}</div>
          {(settings?.address || settings?.city || settings?.state || settings?.pincode) && (
            <div style={{ fontSize: 11, color: "var(--bp-tx3)", maxWidth: 320 }}>
              {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ")}
            </div>
          )}
          {(settings?.phone || settings?.email) && (
            <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>
              {[settings?.phone && `Tel: ${settings.phone}`, settings?.email].filter(Boolean).join(" · ")}
            </div>
          )}
          {settings?.gstin && <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>GSTIN: {settings.gstin}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bp-tx)" }}>PURCHASE BILL</div>
          <div style={{ fontSize: 12, color: "var(--bp-tx2)" }}>{bill.billNumber}</div>
          <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>Date: {formatDate(bill.billDate)}</div>
          {bill.dueDate && <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>Due: {formatDate(bill.dueDate)}</div>}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bp-tx3)", textTransform: "uppercase", marginBottom: 3 }}>Vendor</div>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }} title={bill.vendor.name}>{bill.vendor.name}</div>
        {bill.vendor.company && <div style={{ fontSize: 11, color: "var(--bp-tx2)" }}>{bill.vendor.company}</div>}
        {bill.vendor.address && <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>{bill.vendor.address}</div>}
        {bill.vendor.gstin && <div style={{ fontSize: 11, color: "var(--bp-tx3)" }}>GSTIN: {bill.vendor.gstin}</div>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          {(() => {
            const th = (label: string, align: "left" | "right" = "left", width?: number) => {
              const lastSpace = label.lastIndexOf(" ");
              const content = lastSpace === -1
                ? label
                : <>{label.slice(0, lastSpace)}<br />{label.slice(lastSpace + 1)}</>;
              return (
                <th key={label} style={{ border: `1px solid var(--bp-bd)`, padding: "6px 4px", textAlign: align, width, lineHeight: 1.25 }}>{content}</th>
              );
            };
            return (
              <tr style={{ background: "var(--bp-bg3)" }}>
                {th("S.N.", "left", 28)}
                {th("Description of Goods", "left", 170)}
                {th("HSN/SAC Code")}
                {th("Qty.", "right")}
                {th("Unit")}
                {th("List Price", "right")}
                {th("Discount", "right")}
                {th("Taxable Amount", "right")}
                {bill.isInterState ? (
                  th("IGST", "right")
                ) : (
                  <>{th("CGST", "right")}{th("SGST", "right")}</>
                )}
                {th("Amount(Rs.)", "right")}
              </tr>
            );
          })()}
        </thead>
        <tbody>
          {bill.items.map((item, idx) => {
            const rowBg = idx % 2 === 1 ? "var(--bp-bg2)" : "var(--bp-bg)";
            const halfRate = item.gstRate / 2;
            const halfGst = item.gstAmount / 2;
            const td = (content: React.ReactNode, align: "left" | "right" = "left", width?: number) => (
              <td style={{ border: `1px solid var(--bp-bd)`, padding: "6px 4px", textAlign: align, width, background: rowBg }}>{content}</td>
            );
            return (
              <tr key={item.id}>
                {td(idx + 1, "left")}
                {td(
                  // 2-line clamp (see generateInvoicePdf.ts's ROW_SAFETY_MARGIN_PX); needs its own px width or an
                  // unwrapped div's full text length wins as the column's min-content and stretches the table.
                  <div style={{
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden", textOverflow: "ellipsis",
                    width: 155, maxWidth: "100%",
                  }} title={item.name}>
                    {item.name}
                  </div>,
                  "left",
                  170
                )}
                <td style={{ border: `1px solid var(--bp-bd)`, padding: "6px 4px", textAlign: "left", background: rowBg }}>
                  {/* Real HSN/SAC codes are numeric-only, max 8 digits — a
                      fixed single-line ellipsis (not a 2-line clamp, unlike
                      the item name) guards against a stray long/garbage
                      value wrapping unpredictably. Same fix as the invoice
                      detail page. */}
                  <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", width: 55, maxWidth: "100%" }} title={item.hsn || "—"}>
                    {item.hsn || "—"}
                  </div>
                </td>
                {td(item.quantity, "right")}
                {td(item.unit)}
                {td(fmt(item.purchasePrice), "right")}
                {td(item.discountPercent > 0 ? `${item.discountPercent}% (−₹${fmt(item.discountAmount)})` : "—", "right")}
                {td(fmt(item.quantity * item.purchasePrice - item.discountAmount), "right")}
                {bill.isInterState ? (
                  td(`${item.gstRate}% (₹${fmt(item.gstAmount)})`, "right")
                ) : (
                  <>{td(`${halfRate}% (₹${fmt(halfGst)})`, "right")}{td(`${halfRate}% (₹${fmt(halfGst)})`, "right")}</>
                )}
                {td(fmt(item.total), "right")}
              </tr>
            );
          })}
          {!!bill.transportCharge && bill.transportCharge > 0 && (() => {
            const tcTaxable = bill.transportCharge ?? 0;
            const tcGst = bill.transportChargeGstAmount ?? 0;
            const tcRate = bill.transportChargeGstRate ?? 0;
            const tcHalfRate = tcRate / 2;
            const tcHalfGst = tcGst / 2;
            const tcTd = (content: React.ReactNode, bold = false) => (
              <td style={{ border: `1px solid var(--bp-bd)`, padding: "6px 4px", textAlign: "right", background: "var(--bp-bg)", fontWeight: bold ? 700 : undefined, color: bold ? "var(--bp-tx)" : undefined, whiteSpace: "nowrap" }}>
                {content}
              </td>
            );
            return (
              <tr>
                <td colSpan={7} style={{ border: `1px solid var(--bp-bd)`, padding: "6px 4px", background: "var(--bp-bg)", fontWeight: 600, color: "var(--bp-tx)" }}>
                  Transportation Charges
                </td>
                {tcTd(fmt(tcTaxable))}
                {bill.isInterState
                  ? tcTd(`${tcRate}% (₹${fmt(tcGst)})`)
                  : <>{tcTd(`${tcHalfRate}% (₹${fmt(tcHalfGst)})`)}{tcTd(`${tcHalfRate}% (₹${fmt(tcHalfGst)})`)}</>}
                {tcTd(fmt(tcTaxable + tcGst), true)}
              </tr>
            );
          })()}
          {(() => {
            const bpLabelCell: CSSProperties = { border: `1px solid var(--bp-bd)`, padding: "5px 8px", color: "var(--bp-tx2)", background: "var(--bp-bg2)" };
            const bpValueCell: CSSProperties = { ...bpLabelCell, textAlign: "right" };
            const bpTotalsRows = 5 + (bill.discount > 0 ? 2 : 0) + (bill.roundOff !== 0 ? 1 : 0);
            const notesColSpan = (bill.isInterState ? 10 : 11) - 2;
            return (
              <>
                <tr data-invoice-summary-start="true">
                  <td colSpan={notesColSpan} rowSpan={bpTotalsRows} style={{ border: `1px solid var(--bp-bd)`, padding: "10px 12px", verticalAlign: "top", fontSize: 10.5, color: "var(--bp-tx3)" }}>
                    <div style={{ fontStyle: "italic" }}><strong>Amount in Words:</strong> {amountInWordsINR(bill.total)}</div>
                    {bill.notes && <div style={{ marginTop: 6 }}><strong>Note:</strong> {bill.notes}</div>}
                  </td>
                  <td style={bpLabelCell}>Subtotal</td>
                  <td style={bpValueCell}>₹{fmt(bill.subtotal + (bill.transportCharge ?? 0))}</td>
                </tr>
                {/* Includes Transportation Charges' own GST (shown split
                    out on its own row above) — otherwise this would
                    silently under-report the tax actually charged. */}
                <tr>
                  <td style={bpLabelCell}>GST</td>
                  <td style={bpValueCell}>₹{fmt(bill.taxAmount + (bill.transportChargeGstAmount ?? 0))}</td>
                </tr>
                {bill.discount > 0 && (
                  <>
                    <tr>
                      <td style={bpLabelCell}>Discount</td>
                      <td style={bpValueCell}>−₹{fmt(bill.discount)}</td>
                    </tr>
                    <tr>
                      <td style={bpLabelCell}>Taxable Value</td>
                      <td style={bpValueCell}>₹{fmt(bill.subtotal - bill.discount)}</td>
                    </tr>
                  </>
                )}
                {bill.roundOff !== 0 && (
                  <tr>
                    <td style={bpLabelCell}>Round Off</td>
                    <td style={bpValueCell}>{bill.roundOff > 0 ? "+" : "−"}₹{fmt(Math.abs(bill.roundOff))}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ ...bpLabelCell, fontWeight: 700, color: "var(--bp-tx)", background: "var(--bp-bg4)", fontSize: 12 }}>Total</td>
                  <td style={{ ...bpValueCell, fontWeight: 700, color: "var(--bp-tx)", background: "var(--bp-bg4)", fontSize: 12 }}>₹{fmt(bill.total)}</td>
                </tr>
                <tr>
                  <td style={bpLabelCell}>Paid</td>
                  <td style={bpValueCell}>₹{fmt(bill.paidAmount)}</td>
                </tr>
                <tr>
                  <td style={{ ...bpLabelCell, fontWeight: 700, color: "var(--bp-tx)" }}>Balance Due</td>
                  <td style={{ ...bpValueCell, fontWeight: 700, color: "var(--bp-tx)" }}>₹{fmt(balance)}</td>
                </tr>
              </>
            );
          })()}
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      open={confirmCancel}
      title="Cancel Purchase Bill"
      message={`Cancel bill ${bill.billNumber}? Its stock will be reversed. You can un-cancel it later if needed.`}
      confirmLabel="Cancel Bill"
      variant="danger"
      loading={cancelling}
      onConfirm={handleCancel}
      onCancel={() => { if (!cancelling) setConfirmCancel(false); }}
    />

    <ConfirmDialog
      open={confirmUncancel}
      title="Un-cancel Purchase Bill"
      message={`Restore bill ${bill.billNumber} from cancelled? Stock will be re-added and its status recomputed from recorded payments.`}
      confirmLabel="Un-cancel Bill"
      variant="danger"
      loading={uncancelling}
      onConfirm={handleUncancel}
      onCancel={() => { if (!uncancelling) setConfirmUncancel(false); }}
    />

    <ConfirmDialog
      open={confirmDelete}
      title="Delete Purchase Bill"
      message={`Move bill ${bill.billNumber} to bin? You can restore it within 30 days.`}
      confirmLabel="Move to Bin"
      variant="danger"
      loading={deleting}
      onConfirm={handleDelete}
      onCancel={() => { if (!deleting) setConfirmDelete(false); }}
    />

    <Modal
      open={emailModalOpen}
      title="Email Purchase Bill"
      onClose={() => { if (!sendingEmail) setEmailModalOpen(false); }}
      variant="fullscreen"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={sendingEmail} onClick={() => setEmailModalOpen(false)}>Cancel</Button>
          <Button type="submit" form="purchase-bill-email-form" variant="primary" loading={sendingEmail} disabled={sendingEmail}>Send</Button>
        </>
      }
    >
      <form id="purchase-bill-email-form" onSubmit={handleSendEmail} noValidate>
        <FormField label="Recipient Email(s)" required error={emailToError} hint="Separate multiple addresses with commas.">
          <Input
            type="text"
            value={emailTo}
            onChange={(e) => { setEmailTo(e.target.value); setEmailToError(undefined); }}
            placeholder="vendor@example.com, accounts@example.com"
            maxLength={1000}
            autoFocus
            disabled={sendingEmail}
          />
        </FormField>
      </form>
    </Modal>

    <div className={`page-stack ${styles.pageStack}`}>

      {/* ── Breadcrumb + toolbar ── */}
      <div className={styles.toolbarRow}>
        <div>
          <Breadcrumb items={[{ label: "Purchase Bills", href: "/purchases/bills" }, { label: bill.billNumber }]} />
        </div>
        <div className={styles.toolbarActions}>
          <StatusBadge status={bill.status} />
          {isOverdue && (
            <span className={styles.overdueBadge}>
              OVERDUE
            </span>
          )}
          {canWrite && (
          <Button
            variant="editOutline"
            size="sm"
            disabled={bill.status === "paid" || bill.status === "cancelled"}
            title={bill.status === "paid" || bill.status === "cancelled" ? `Bill is ${bill.status} — nothing left to edit` : undefined}
            onClick={() => { setOpeningEdit(true); router.push(`/purchases/bills/${bill.id}/edit`); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit Bill
          </Button>
          )}
          {canWrite && bill.status !== "paid" && bill.status !== "cancelled" && (
            <Button variant="primary" size="sm" onClick={() => { setShowPayForm(v => !v); resetPaymentForm(); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              {showPayForm ? "Hide Payment" : "Record Payment"}
            </Button>
          )}
          <Button variant="viewOutline" size="sm" onClick={handleViewPdf} loading={pdfViewing}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            View
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleDownloadPdf(false)} disabled={pdfDownloading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {pdfDownloading ? "Generating…" : "Download PDF"}
          </Button>
          <Button variant="secondary" size="sm" title="Discard the cached PDF and download a freshly generated copy" aria-label="Regenerate PDF" onClick={() => handleDownloadPdf(true)} disabled={pdfDownloading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </Button>
          {/* Share PDF button */}
          <div className={styles.shareWrap} ref={shareContainerRef}>
            <Button variant="secondary" size="sm" disabled={shareLoading} aria-haspopup="menu" aria-expanded={shareOpen} onClick={() => {
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.shareIconMargin}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share PDF
            </Button>
            {shareOpen && (
              <>
                <div className={styles.shareOverlay} onClick={() => setShareOpen(false)} />
                <div className={styles.shareMenu} style={shareDropStyle} ref={shareMenuRef} role="menu" aria-label="Share PDF">
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
                      role="menuitem"
                      onClick={() => handleShare(opt!.key as "native" | "whatsapp" | "email")}
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
          {canWrite && bill.status !== "cancelled" && (
            <Button variant="dangerOutline" size="sm" onClick={() => setConfirmCancel(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              Cancel Bill
            </Button>
          )}
          {canWrite && bill.status === "cancelled" && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmUncancel(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Un-cancel Bill
            </Button>
          )}
          {canWrite && (
          <Button variant="dangerOutline" size="sm" onClick={() => setConfirmDelete(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            Delete
          </Button>
          )}
        </div>
      </div>

      {/* ── Record Payment form (same compact layout & position as sales/invoices detail) ── */}
      {showPayForm && bill.status !== "paid" && bill.status !== "cancelled" && (
        <div className={`card ${styles.paymentFormCard}`}>
          <h3 className={styles.paymentFormTitle}>Record Payment</h3>
          <form onSubmit={handlePayment} noValidate>
            <div className={styles.paymentFormRow}>
              <FormField label="Amount (₹)" error={payAmountError}>
                <div className={styles.paymentAmountRow}>
                  <Input
                    type="number" min="0.01" step="0.01" max={balance}
                    value={payAmount}
                    onChange={e => { setPayAmount(e.target.value); setPayAmountError(undefined); }}
                    placeholder={`e.g. ${balance.toFixed(2)}`}
                    sz="sm"
                    className={styles.paymentAmountInput}
                    autoFocus
                  />
                  <FillMaxButton onClick={() => setPayAmount(balance.toFixed(2))} label={`Full ₹${fmt(balance)}`} variant="green" />
                </div>
              </FormField>
              <div className={styles.paymentDateField}>
                <FormField label="Date">
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} min={bill.billDate.slice(0, 10)} max={new Date().toISOString().slice(0, 10)} sz="sm" />
                </FormField>
              </div>
              <div className={styles.paymentMethodField}>
                <FormField label="Method">
                  <Select value={payMethod} onChange={e => setPayMethod(e.target.value)} sz="sm">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormField>
              </div>
              <FormField label="Reference / UTR">
                <Input
                  type="text"
                  value={payRef}
                  onChange={e => setPayRef(e.target.value)}
                  placeholder="Optional"
                  sz="sm"
                  maxLength={500}
                  className={styles.paymentReferenceInput}
                />
              </FormField>
              <div className={styles.paymentFormBtnRow}>
                <Button type="submit" variant="primary" size="sm" disabled={submitting} loading={submitting}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  Save Payment
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setShowPayForm(false); resetPaymentForm(); }} disabled={submitting}>Cancel</Button>
              </div>
            </div>
            <p className={styles.paymentBalanceHint}>
              Balance due: ₹{fmt(balance)}
            </p>
          </form>
        </div>
      )}

      {/* ── KPI stat strip ── */}
      <div {...animateSection(0, styles.statStrip)}>
        <StatCard label="Subtotal"    value={`₹${fmtShort(bill.subtotal)}`} />
        <StatCard label="GST"         value={`₹${fmtShort(bill.taxAmount)}`} />
        {bill.discount > 0 && <StatCard label="Discount" value={`−₹${fmtShort(bill.discount)}`} color="var(--c-red)" />}
        <StatCard label="Total"       value={`₹${fmtShort(bill.total)}`}     color="var(--c-text)" />
        <StatCard label="Paid"        value={`₹${fmtShort(bill.paidAmount)}`} color="var(--c-green-text)" sub={`${bill.payments.length} payment(s)`} />
        <StatCard label="Balance Due" value={`₹${fmtShort(balance)}`}        color={balance > 0 ? "var(--c-amber)" : "var(--c-green-text)"} />
      </div>

      {/* ── Info cards: Vendor | Bill Meta ── */}
      <div {...animateSection(1, styles.infoGrid)}>
        {/* Vendor */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.infoCardLabel}>Vendor</div>
          <Link
            href={`/purchases/vendors/${bill.vendor.id}`}
            className={styles.vendorName}
            title={bill.vendor.name}
          >
            {bill.vendor.name}
          </Link>
          {bill.vendor.company && (
            <div className={styles.vendorCompany}>{bill.vendor.company}</div>
          )}
          <div className={styles.vendorDetails}>
            {bill.vendor.gstin && (
              <div className={styles.vendorGstin}>
                GSTIN: {bill.vendor.gstin}
              </div>
            )}
            {bill.vendor.phone && (
              <div className={styles.vendorContactLine}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.69 10.66 19.79 19.79 0 011.62 2.05 2 2 0 013.62 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.91 7.91a16 16 0 006.18 6.18l.95-.95a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 15.32z"/></svg>
                {bill.vendor.phone}
              </div>
            )}
            {bill.vendor.email && (
              <div className={styles.vendorContactLine}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {bill.vendor.email}
              </div>
            )}
            {bill.vendor.address && (
              <div className={styles.vendorAddress}>{bill.vendor.address}</div>
            )}
            {!bill.vendor.gstin && !bill.vendor.phone && !bill.vendor.email && !bill.vendor.address && (
              <div className={styles.vendorNoContact}>No contact details on file</div>
            )}
          </div>
        </div>

        {/* Bill Meta */}
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.infoCardLabel}>Bill Information</div>
          <InfoRow label="Bill Date"   value={formatDate(bill.billDate)} />
          <InfoRow label="Due Date"    value={bill.dueDate ? formatDate(bill.dueDate) : "Not set"} />
          <InfoRow label="Category"    value={bill.category || "—"} />
          <InfoRow label="Created By"  value={bill.createdBy.name} />
          <InfoRow label="Created At"  value={new Date(bill.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })} />
          {bill.attachmentUrl && (
            <div className={styles.infoRow}>
              <span className={styles.infoRowLabel}>Attachment</span>
              <a href={bill.attachmentUrl} target="_blank" rel="noopener noreferrer" download={bill.attachmentName ?? undefined} title={bill.attachmentName ?? undefined} className={styles.infoRowValue} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <AttachmentIcon name={bill.attachmentName} />
                {bill.attachmentName ? truncateFilename(bill.attachmentName) : "View attachment"}
              </a>
            </div>
          )}
          {bill.notes && (
            <div className={styles.billNote}>
              <span className={styles.billNoteLabel}>Note:</span>{bill.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Items table ── */}
      <div {...animateSection(3, "card")}>
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionHeading}>
            Items <span className={styles.sectionCount}>({bill.items.length})</span>
          </h3>
        </div>
        <div className={styles.tableScroll}>
          <table className={`table-base ${styles.itemsTable}`}>
            <colgroup>
              <col className={styles.colNum} />
              <col className={styles.colItem} />
              <col className={styles.colHsn} />
              <col className={styles.colQty} />
              <col className={styles.colRate} />
              <col className={styles.colDiscount} />
              <col className={styles.colGstRate} />
              <col className={styles.colGstAmt} />
              <col className={styles.colTotal} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>HSN/SAC</th>
                <th className={styles.textRight}>Qty</th>
                <th className={styles.textRight}>Rate</th>
                <th className={styles.textRight}>Discount</th>
                <th className={styles.textRight}>GST %</th>
                <th className={styles.textRight}>GST Amt</th>
                <th className={styles.textRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item, idx) => (
                <tr key={item.id}>
                  <td data-mobile-hide className={styles.textMuted}>{idx + 1}</td>
                  <td data-mobile-full>
                    <div className={styles.itemName}>{item.name}</div>
                    <div className={styles.itemUnit}>{item.unit}</div>
                  </td>
                  <td data-label="HSN/SAC" className={styles.textMuted}>{item.hsn || "—"}</td>
                  <td data-label="Qty" className={styles.qtyCell}>{item.quantity}</td>
                  <td data-label="Rate" className={styles.textRight}>₹{fmt(item.purchasePrice)}</td>
                  <td data-label="Discount" className={`${styles.textRight} ${styles.textMuted}`}>{item.discountPercent > 0 ? `${item.discountPercent}% (−₹${fmt(item.discountAmount)})` : "—"}</td>
                  <td data-label="GST %" className={`${styles.textRight} ${styles.textMuted}`}>{item.gstRate}%</td>
                  <td data-label="GST Amt" className={styles.gstAmtCell}>₹{fmt(item.gstAmount)}</td>
                  <td data-label="Total" className={styles.totalCell}>₹{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {!!bill.transportCharge && bill.transportCharge > 0 && (
                <tr>
                  <td colSpan={8} className={`${styles.textRight} ${styles.textMuted}`}>Transport Charge</td>
                  <td className={`${styles.textRight} ${styles.textMuted}`}>₹{fmt(bill.transportCharge)}</td>
                </tr>
              )}
              {!!bill.transportChargeGstAmount && bill.transportChargeGstAmount > 0 && (
                <tr>
                  <td colSpan={8} className={`${styles.textRight} ${styles.textMuted}`}>Transport GST {bill.transportChargeGstRate}%</td>
                  <td className={`${styles.textRight} ${styles.textMuted}`}>₹{fmt(bill.transportChargeGstAmount)}</td>
                </tr>
              )}
              {bill.roundOff !== 0 && (
                <tr>
                  <td colSpan={8} className={`${styles.textRight} ${styles.textMuted}`}>Round Off</td>
                  <td className={`${styles.textRight} ${styles.textMuted}`}>{bill.roundOff > 0 ? "+" : "−"}₹{fmt(Math.abs(bill.roundOff))}</td>
                </tr>
              )}
              <tr className={styles.tfootRow}>
                <td colSpan={8} className={styles.tfootLabelCell}>Grand Total</td>
                <td className={styles.tfootValueCell}>₹{fmt(bill.total)}</td>
              </tr>
              <tr>
                <td colSpan={9} className={styles.amountInWordsCell}>{amountInWordsINR(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Payment History ── */}
      <div {...animateSection(4, "card")}>
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionHeading}>
            Payment History
            {bill.payments.length > 0 && (
              <span className={styles.sectionCount}>({bill.payments.length})</span>
            )}
          </h3>
          {balance > 0 && bill.status !== "cancelled" && (
            <span className={styles.outstandingPill}>
              ₹{fmt(balance)} outstanding
            </span>
          )}
          {balance === 0 && (
            <span className={styles.fullyPaidPill}>
              Fully paid
            </span>
          )}
        </div>
        {bill.payments.length === 0 ? (
          <div className={styles.emptyPayments}>
            No payments recorded yet.
            {bill.status !== "paid" && bill.status !== "cancelled" && (
              <div className={styles.emptyPaymentsAction}>
                <button
                  onClick={() => setShowPayForm(true)}
                  className={styles.linkButton}
                >
                  Record a payment <ArrowIcon />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={`table-base ${styles.paymentsTable}`}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className={styles.textRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.payments.map(p => (
                  <tr key={p.id}>
                    <td data-label="Date" className={styles.paymentDateCell}>{formatDate(p.date)}</td>
                    <td data-label="Method">
                      <span className={styles.methodPill}>
                        {p.method}
                      </span>
                    </td>
                    <td data-label="Reference" className={styles.referenceCell}>{p.reference || "—"}</td>
                    <td data-label="Amount" className={styles.paymentAmountCell}>₹{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.tfootRow}>
                  <td colSpan={3} className={styles.tfootLabelCell}>Total Paid</td>
                  <td className={styles.tfootPaidValueCell}>₹{fmt(bill.paidAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className={styles.footerActions}>
        <Button variant="secondary" href="/purchases/bills">← Back to Bills</Button>
      </div>
    </div>
    </>
  );
}
