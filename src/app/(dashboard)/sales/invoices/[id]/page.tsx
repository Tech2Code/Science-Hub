"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fetchCached, useFetch } from "@/lib/useCache";
import { invalidateAfter } from "@/lib/cacheInvalidation";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Select, FormField } from "@/components/ui/Input";
import { FillMaxButton } from "@/components/ui/FillMaxButton";
import { useToast } from "@/components/ui/Toast";
import { rules, validate, toIstDateStr, isFutureIstDate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Modal } from "@/components/dialogs/Modal";
import { PdfCopyDialog } from "@/components/dialogs/PdfCopyDialog";
import { PdfPreviewModal } from "@/components/ui/PdfPreviewModal";
import { generateInvoicePdfBlob } from "@/lib/generateInvoicePdf";
import { withCachedPdf, buildPdfVariantKey } from "@/lib/pdfCache";
import { useCanWrite } from "@/lib/useCanWrite";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { ReassignOwnerModal } from "@/components/dialogs/ReassignOwnerModal";
import { formatDateTime } from "@/lib/formatDate";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useDirty } from "@/lib/useDirty";
import { useMenuA11y } from "@/lib/useMenuA11y";
import { PAYMENT_METHODS, resolvePaymentMethod, methodSelectValue, methodCustomText } from "@/lib/paymentMethods";
import { InvoicePrintArea } from "@/components/invoices/InvoicePrintArea";
import { PrintAreaStyles } from "@/components/invoices/PrintAreaStyles";
import { InvoiceDetailSkeleton } from "./_components/InvoiceDetailSkeleton";
import { CreditNotePrintArea } from "./_components/CreditNotePrintArea";
import { PaymentHistoryCard } from "./_components/PaymentHistoryCard";
import { ReturnHistoryCard } from "./_components/ReturnHistoryCard";
import { fmt, type BusinessSettings, type Invoice, type InvoiceItem, type Payment, type ReturnRecord } from "@/components/invoices/invoiceDetailTypes";
import styles from "./invoiceDetail.module.css";

interface ReturnFormItem {
  productId: string; name: string; price: number; discountPercent: number; selected: boolean; qty: number; maxQty: number; qtyText: string;
}

/**
 * Remaining returnable qty per invoice line (same order as `items`). Mirrors the returns route:
 * catalog lines match by productId; custom (no productId) lines match returned custom lines by
 * trimmed lowercase name, with the already-returned qty for a name allocated across same-name
 * lines in order so the total cap is "invoiced − already returned" for that name.
 */
function remainingReturnQty(items: InvoiceItem[], returns: ReturnRecord[]): number[] {
  const returnedByProduct: Record<string, number> = {};
  const returnedByName: Record<string, number> = {};
  for (const ret of returns) {
    for (const ri of ret.items) {
      if (ri.productId) returnedByProduct[ri.productId] = (returnedByProduct[ri.productId] ?? 0) + ri.quantity;
      else {
        const key = ri.name.trim().toLowerCase();
        returnedByName[key] = (returnedByName[key] ?? 0) + ri.quantity;
      }
    }
  }
  return items.map((item) => {
    if (item.productId) return item.quantity - (returnedByProduct[item.productId] ?? 0);
    const key = item.name.trim().toLowerCase();
    const used = Math.min(item.quantity, returnedByName[key] ?? 0);
    returnedByName[key] = (returnedByName[key] ?? 0) - used;
    return item.quantity - used;
  });
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canWrite = useCanWrite();
  const isAdmin = useIsAdmin();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const paymentIdempotency = useIdempotencyKey();
  const returnIdempotency = useIdempotencyKey();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const { data: settings, loading: settingsLoading } = useFetch<BusinessSettings>("/api/settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "Cheque", reference: "", date: toIstDateStr(new Date()) });
  const [paymentOtherMethod, setPaymentOtherMethod] = useState("");
  const [paymentAmountError, setPaymentAmountError] = useState<string | undefined>(undefined);
  const [paymentDateError, setPaymentDateError] = useState<string | undefined>(undefined);
  const [paymentOtherMethodError, setPaymentOtherMethodError] = useState<string | undefined>(undefined);
  const [addingPayment, setAddingPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ amount: "", method: "Cheque", reference: "", date: "" });
  const [editPaymentOtherMethod, setEditPaymentOtherMethod] = useState("");
  const [editPaymentAmountError, setEditPaymentAmountError] = useState<string | undefined>(undefined);
  const [editPaymentDateError, setEditPaymentDateError] = useState<string | undefined>(undefined);
  const [editPaymentOtherMethodError, setEditPaymentOtherMethodError] = useState<string | undefined>(undefined);
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
  const editPaymentDirty = useDirty({ ...editPaymentForm, otherMethod: editPaymentOtherMethod });
  const [paymentDeleteConfirm, setPaymentDeleteConfirm] = useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareDropStyle, setShareDropStyle] = useState<React.CSSProperties>({});
  const shareContainerRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  useMenuA11y(shareOpen, () => setShareOpen(false), shareMenuRef);

  // Customer's own email pre-fills the field so it can be selected directly
  // instead of retyped, but stays editable/extendable — an invoice may need
  // to go to more than one recipient, so the field accepts a comma-separated list.
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailToError, setEmailToError] = useState<string | undefined>(undefined);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showPaymentInPdf, setShowPaymentInPdf] = useState(false);
  const [showReturnInPdf, setShowReturnInPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfCopyDialogOpen, setPdfCopyDialogOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfPrinting, setPdfPrinting] = useState(false);
  const [pdfViewing, setPdfViewing] = useState(false);
  const [pdfRegenerating, setPdfRegenerating] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnFormItem[]>([]);
  const returnQtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnDateError, setReturnDateError] = useState<string | undefined>(undefined);
  const [returnItemsError, setReturnItemsError] = useState<string | undefined>(undefined);
  // Always-shown preview of the credit note number this return will get if saved right now (see
  // /api/credit-notes/next-number) — refetched whenever the return date changes, since the FY
  // segment (and so the whole number) is derived from that date, not "now".
  const [nextCreditNoteNumber, setNextCreditNoteNumber] = useState("");
  const [addingReturn, setAddingReturn] = useState(false);
  const [returnDeleteConfirm, setReturnDeleteConfirm] = useState<ReturnRecord | null>(null);
  const [deletingReturn, setDeletingReturn] = useState(false);
  const [creditNoteToRender, setCreditNoteToRender] = useState<ReturnRecord | null>(null);
  const [creditNoteDownloadingId, setCreditNoteDownloadingId] = useState<string | null>(null);
  const [openingEdit, setOpeningEdit] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  async function load(force = false) {
    try {
      const data = await fetchCached<Invoice>(`/api/invoices/${id}`, force);
      setInvoice(data);
    } catch { setError("Invoice not found."); }
    setLoading(false);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-id-change; load() sets invoice/settings/loading state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is redefined every render but reads only `id`, already in the dep array
  }, [id]);

  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    fetch(`/api/invoices/${id}/returns`, { headers: { "x-no-loader": "1" } })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setReturns([]); return; }
        setReturns([...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      })
      .catch(() => { });
  }, [id]);

  // Lets the Credit Notes list page's View/Download buttons reuse this page's
  // own #credit-note-print-area via the hidden-iframe PDF generator (same
  // trick the Invoices list page uses for its own PDF buttons) — a
  // ?creditNoteId=<returnId> URL loaded in that iframe auto-mounts the
  // matching return's print area without any click needed.
  useEffect(() => {
    const wantedId = searchParams.get("creditNoteId");
    if (!wantedId || returns.length === 0) return;
    const match = returns.find(r => r.id === wantedId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auto-mount driven by the iframe's URL, not a derived-state sync
    if (match) setCreditNoteToRender(match);
  }, [returns, searchParams]);

  // Set page title to invoice number so browser Ctrl+P / Save as PDF uses the right filename
  useEffect(() => {
    if (!invoice) return;
    const prev = document.title;
    document.title = invoice.invoiceNumber;
    return () => { document.title = prev; };
  }, [invoice]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(paymentForm.amount);
    // Collected together (not sequential early-returns) so every invalid field shows its red
    // border/hint on the same submit attempt, instead of revealing them one at a time across
    // repeated clicks as each earlier field gets fixed.
    const amtErr = validate(paymentForm.amount, rules.required("Amount is required."), rules.positiveNumber("Enter a valid amount greater than 0."))
      ?? (amt > balance ? `Amount cannot exceed balance due (₹${fmt(balance)}).` : undefined);
    const dateErr = invoice && paymentForm.date < toIstDateStr(new Date(invoice.date))
      ? "Payment date cannot be before the invoice date."
      : isFutureIstDate(paymentForm.date)
        ? "Payment date cannot be in the future."
        : undefined;
    const otherMethodErr = paymentForm.method === "Other" && !paymentOtherMethod.trim() ? "Please specify the payment method." : undefined;
    setPaymentAmountError(amtErr);
    setPaymentDateError(dateErr);
    setPaymentOtherMethodError(otherMethodErr);
    if (amtErr || dateErr || otherMethodErr) return;
    const method = resolvePaymentMethod(paymentForm.method, paymentOtherMethod);
    setAddingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, reference: paymentForm.reference, date: paymentForm.date, idempotencyKey: paymentIdempotency.key() }),
      });
      if (res.ok) {
        paymentIdempotency.renew(); // this dialog can be reopened for another payment — a fresh key must back the next submit
        setShowPaymentForm(false);
        setPaymentForm({ amount: "", method: "Cheque", reference: "", date: toIstDateStr(new Date()) });
        setPaymentOtherMethod("");
        setPaymentAmountError(undefined);
        setPaymentDateError(undefined);
        setPaymentOtherMethodError(undefined);
        invalidateAfter({ type: "invoice-payment-changed", invoiceId: id });
        load(true);
        toast({ type: "success", title: "Payment recorded", message: `₹${parseFloat(paymentForm.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via ${method}` });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to record payment." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setAddingPayment(false);
  }

  function openEditPayment(p: Payment) {
    const initial = { amount: String(p.amount), method: methodSelectValue(p.method), reference: p.reference || "", date: toIstDateStr(new Date(p.date)) };
    const initialOtherMethod = methodCustomText(p.method);
    setEditingPayment(p);
    setEditPaymentForm(initial);
    setEditPaymentOtherMethod(initialOtherMethod);
    setEditPaymentAmountError(undefined);
    setEditPaymentDateError(undefined);
    setEditPaymentOtherMethodError(undefined);
    editPaymentDirty.markClean({ ...initial, otherMethod: initialOtherMethod });
  }

  async function handleEditPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPayment || !invoice || !editPaymentDirty.isDirty) return;
    const editBalance = Math.round((invoice.total - invoice.paidAmount + editingPayment.amount) * 100) / 100;
    const amt = parseFloat(editPaymentForm.amount);
    const amtErr = validate(editPaymentForm.amount, rules.required("Amount is required."), rules.positiveNumber("Enter a valid amount greater than 0."))
      ?? (amt > editBalance ? `Amount cannot exceed balance due (₹${fmt(editBalance)}).` : undefined);
    const dateErr = editPaymentForm.date < toIstDateStr(new Date(invoice.date))
      ? "Payment date cannot be before the invoice date."
      : isFutureIstDate(editPaymentForm.date)
        ? "Payment date cannot be in the future."
        : undefined;
    const otherMethodErr = editPaymentForm.method === "Other" && !editPaymentOtherMethod.trim() ? "Please specify the payment method." : undefined;
    setEditPaymentAmountError(amtErr);
    setEditPaymentDateError(dateErr);
    setEditPaymentOtherMethodError(otherMethodErr);
    if (amtErr || dateErr || otherMethodErr) return;

    const method = resolvePaymentMethod(editPaymentForm.method, editPaymentOtherMethod);
    setSavingPaymentEdit(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payment/${editingPayment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, reference: editPaymentForm.reference, date: editPaymentForm.date }),
      });
      if (res.ok) {
        setEditingPayment(null);
        invalidateAfter({ type: "invoice-payment-changed", invoiceId: id });
        load(true);
        toast({ type: "success", title: "Payment updated" });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update payment." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSavingPaymentEdit(false);
  }

  async function handleDeletePayment() {
    if (!paymentDeleteConfirm) return;
    setDeletingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payment/${paymentDeleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setPaymentDeleteConfirm(null);
        invalidateAfter({ type: "invoice-payment-changed", invoiceId: id });
        load(true);
        toast({ type: "success", title: "Payment deleted" });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to delete payment." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setDeletingPayment(false);
  }

  function openReturnForm() {
    if (!invoice) return;
    const remaining = remainingReturnQty(invoice.items, returns);
    setReturnItems(invoice.items.map((item, idx) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      discountPercent: item.discountPercent ?? 0,
      selected: false,
      qty: 1,
      maxQty: remaining[idx],
      qtyText: "1",
    })).filter(ri => ri.maxQty > 0));
    setReturnNotes("");
    setReturnDate(toIstDateStr(new Date()));
    setReturnDateError(undefined);
    setReturnItemsError(undefined);
    setShowReturnForm(true);
  }

  useEffect(() => {
    if (!showReturnForm || !returnDate) return;
    const controller = new AbortController();
    fetch(`/api/credit-notes/next-number?date=${encodeURIComponent(returnDate)}`, { headers: { "x-no-loader": "1" }, signal: controller.signal })
      .then((r) => r.json())
      .then((res: { documentNumber?: string }) => setNextCreditNoteNumber(res.documentNumber ?? ""))
      .catch(() => {});
    return () => controller.abort();
  }, [showReturnForm, returnDate]);

  async function handleAddReturn(e: React.FormEvent) {
    e.preventDefault();
    const selected = returnItems.filter(ri => ri.selected && ri.qty > 0);
    if (selected.length === 0) { setReturnItemsError("Select at least one item to return."); return; }
    for (const ri of selected) {
      if (ri.qty > ri.maxQty) { setReturnItemsError(`${ri.name}: quantity exceeds returnable amount (max ${ri.maxQty}).`); return; }
    }
    if (invoice && returnDate < toIstDateStr(new Date(invoice.date))) { setReturnDateError("Return date cannot be before the invoice date."); return; }
    if (isFutureIstDate(returnDate)) { setReturnDateError("Return date cannot be in the future."); return; }
    setReturnItemsError(undefined);
    setReturnDateError(undefined);
    setAddingReturn(true);
    try {
      const res = await fetch(`/api/invoices/${id}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map(ri => ({ productId: ri.productId, name: ri.name, quantity: ri.qty, price: ri.price, discountPercent: ri.discountPercent })),
          notes: returnNotes || undefined,
          date: returnDate || undefined,
          idempotencyKey: returnIdempotency.key(),
        }),
      });
      if (res.ok) {
        returnIdempotency.renew(); // this form can be reopened for another return — a fresh key must back the next submit
        const created = await res.json();
        setReturns(prev => [created, ...prev]);
        setShowReturnForm(false);
        invalidateAfter({ type: "invoice-return-changed", invoiceId: id });
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

  async function handleDeleteReturn() {
    if (!returnDeleteConfirm) return;
    setDeletingReturn(true);
    try {
      const res = await fetch(`/api/invoices/${id}/returns/${returnDeleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setReturns(prev => prev.filter(r => r.id !== returnDeleteConfirm.id));
        invalidateAfter({ type: "invoice-return-changed", invoiceId: id, returnId: returnDeleteConfirm.id });
        toast({ type: "success", title: "Deleted", message: "Credit note moved to bin." });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to delete credit note." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setDeletingReturn(false);
    setReturnDeleteConfirm(null);
  }

  // Cached by return id + a variant key derived from whatever can actually
  // change the rendered PDF (logo/business settings, the customer record) —
  // a credit note's own line items are never edited after creation, but the
  // customer it was issued to can still be, so its updatedAt is part of the
  // key too. Reused as-is until settings/customer change (different key) or
  // the note is deleted (see invalidateCachedPdf in handleDeleteReturn).
  async function getOrRenderCreditNotePdf(ret: ReturnRecord): Promise<Blob | null> {
    const showLogo = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(undefined, {
      logo: showLogo,
      settings: settings?.updatedAt ?? "loading",
      customer: invoice?.customer?.updatedAt ?? "loading",
    });
    return withCachedPdf("return", ret.id, variantKey, async () => {
      setCreditNoteToRender(ret);
      // Wait for the hidden print area to actually mount/paint before
      // html2canvas reads it off the DOM — same two-frame + fonts wait used
      // by the main invoice PDF download.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;
      const el = document.getElementById("credit-note-print-area");
      const blob = el ? await generateInvoicePdfBlob(el, { logoUrl: showLogo ? settings?.logoUrl || undefined : undefined }) : null;
      setCreditNoteToRender(null);
      return blob;
    });
  }

  async function handleDownloadCreditNotePdf(ret: ReturnRecord) {
    setCreditNoteDownloadingId(ret.id);
    const blob = await getOrRenderCreditNotePdf(ret);
    setCreditNoteDownloadingId(null);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate credit note PDF." }); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${ret.creditNoteNumber ?? "Credit-Note"}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function generatePdfBlob(copyLabels?: string[], force = false): Promise<Blob | null> {
    const showLogo = settings?.showLogoOnInvoices !== false;
    const variantKey = buildPdfVariantKey(copyLabels, {
      p: showPaymentInPdf,
      r: showReturnInPdf,
      logo: showLogo,
      settings: settings?.updatedAt ?? "loading",
      customer: invoice?.customer?.updatedAt ?? "loading",
    });
    return withCachedPdf("invoice", id, variantKey, async () => {
      const el = document.getElementById("invoice-print-area");
      if (!el) return null;
      return generateInvoicePdfBlob(el, { copyLabels, logoUrl: showLogo ? settings?.logoUrl || undefined : undefined });
    }, force);
  }

  // Discards whatever's cached for the current toggle state and forces a
  // fresh render — for when something outside the invoice's own data
  // changed (business logo/settings) and the cached copy needs replacing,
  // mirroring the list page's "Regenerate" action.
  async function handleRegeneratePdf() {
    if (!invoice) return;
    setPdfRegenerating(true);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY"], true);
    setPdfRegenerating(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
    toast({ type: "success", title: "Regenerated", message: "Latest PDF generated and cached." });
  }

  function handleDownloadClick() {
    if (!invoice) return;
    setPdfCopyDialogOpen(true);
  }

  async function handleViewPdf() {
    if (!invoice) return;
    setPdfViewing(true);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY"]);
    setPdfViewing(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }
    setPdfPreviewUrl(URL.createObjectURL(blob));
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
    // Cache-first (not force-regenerated) as of 2026-09-09 — every mutation that
    // can change what this invoice's PDF renders (payment/return CRUD, invoice
    // edit/delete, customer edit, settings/logo/bank-details change) now correctly
    // invalidates the cache, so a stale print output is no longer a real risk;
    // the "Regenerate" button remains the manual force-refresh escape hatch.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    setPdfPrinting(true);
    // requestAnimationFrame is fully suspended for backgrounded tabs. That
    // used to matter here because an earlier version opened a tab up front
    // (backgrounding this one) before this wait — now nothing backgrounds
    // this tab on the mobile path, but keep the setTimeout fallback anyway
    // since it's strictly safer than rAF with no downside.
    await new Promise(r => (isMobile ? setTimeout(r, 30) : requestAnimationFrame(() => requestAnimationFrame(r))));
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY", "DUPLICATE COPY"]);
    setPdfPrinting(false);
    if (!blob) { toast({ type: "error", title: "Failed", message: "Could not generate PDF." }); return; }

    const url = URL.createObjectURL(blob);

    // Mobile browsers don't support calling .print() on a hidden/off-screen
    // iframe hosting a PDF. The OS share sheet is the one mobile surface
    // that raises an actual print dialog: iOS lists "Print" (AirPrint)
    // directly among the share targets for a PDF file, and Android exposes
    // its system print service the same way.
    if (isMobile) {
      const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: "application/pdf" });
      let shared = false;
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}` });
          shared = true;
        } catch (err) {
          // Treat a user-cancelled share as handled (don't fall back and
          // redownload a PDF they deliberately dismissed). Any other
          // failure falls through to the download below.
          const e = err as Error;
          if (e.name === "AbortError") shared = true;
          else console.warn("navigator.share failed, falling back to download:", e.name, e.message);
        }
      }
      if (shared) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      // Sharing unavailable or failed — download the PDF instead of opening
      // it in a bare tab: mobile Chrome's inline viewer for a JS-navigated
      // blob URL doesn't reliably expose a print control (confirmed — it
      // opened with no print option at all), but every downloaded PDF opens
      // in the device's own PDF app, which always has one. Same mechanism
      // as the working "Download PDF" button.
      const a = document.createElement("a");
      a.href = url; a.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast({ type: "info", title: "PDF downloaded", message: "Open it from your Downloads/notifications and tap Print from there." });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    const iframe = document.createElement("iframe");
    // Chrome refuses to run print() on a hidden iframe (visibility:hidden /
    // display:none) — it silently no-ops or throws, which used to trip the
    // window.open fallback below on every print. Keep it "visible" but
    // pushed off-screen at zero size instead.
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "none" });
    const cleanup = () => { try { document.body.removeChild(iframe); } catch { /* already removed */ } URL.revokeObjectURL(url); };
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
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

  async function handleShare(channel: "native" | "whatsapp" | "email") {
    setShareOpen(false);
    if (!invoice) return;
    const num = invoice.invoiceNumber;

    if (channel === "email") {
      setEmailTo(invoice.customer.email ?? "");
      setEmailToError(undefined);
      setEmailModalOpen(true);
      return;
    }

    // Generate PDF for the remaining channels — shared copies are always the
    // Original (the Duplicate is for the seller's own records).
    setShareLoading(true);
    await document.fonts.ready;
    const blob = await generatePdfBlob(["ORIGINAL COPY"]);
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
  }

  // Splits the comma-separated recipient field into individual addresses so
  // an invoice can be sent to more than one email in a single send,
  // mirroring how the server itself validates and forwards the list to
  // nodemailer's `to`.
  function parseEmailList(raw: string): string[] {
    return raw.split(",").map(e => e.trim()).filter(Boolean);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
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
      await document.fonts.ready;
      const blob = await generatePdfBlob(["ORIGINAL COPY"]);
      if (!blob) {
        toast({ type: "error", title: "Failed", message: "Could not generate PDF." });
        setSendingEmail(false);
        return;
      }
      const formData = new FormData();
      formData.append("pdf", blob, `${invoice.invoiceNumber}.pdf`);
      formData.append("to", emails.join(","));
      formData.append("invoiceNumber", invoice.invoiceNumber);
      formData.append("customerName", invoice.customer.name);
      formData.append("total", fmt(invoice.total));
      const res = await fetch("/api/send-invoice", { method: "POST", body: formData });
      if (res.ok) {
        toast({ type: "success", title: "Email sent", message: `Invoice ${invoice.invoiceNumber} sent to ${emails.join(", ")}` });
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

  async function handleReassign(targetUserId: string) {
    setReassigning(true);
    try {
      const res = await fetch(`/api/invoices/${id}/reassign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (res.ok) {
        setReassignOpen(false);
        invalidateAfter({ type: "invoice-reassigned" });
        load(true);
        toast({ type: "success", title: "Reassigned", message: "Invoice creator updated." });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to reassign invoice." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setReassigning(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateAfter({ type: "invoice-deleted", invoiceId: id });
        toast({ type: "success", title: "Deleted", message: "Invoice moved to bin." });
        router.push("/sales/invoices");
        // Deliberately no setDeleting(false)/setDeleteConfirm(false) here — this page is about to
        // unmount from the navigation above; resetting them first would briefly re-enable the
        // Delete button/dialog while the push is still in flight, allowing a duplicate delete click.
        return;
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

  if (loading || settingsLoading) return <InvoiceDetailSkeleton />;
  if (error || !invoice) return <div className={`loading-center ${styles.errorText}`}>{error || "Invoice not found."}</div>;

  // Rounded to paise: raw float subtraction (e.g. 1000.3 - 500.1 = 500.19999999999993) made the
  // "Full ₹X" fill-button's own toFixed(2) value fail the client's `amt > balance` check, and left a
  // red "Balance Due ₹0.00" + a visible Record Payment button on an effectively fully-paid invoice.
  const balance = Math.round((invoice.total - invoice.paidAmount) * 100) / 100;

  // True once every line item's quantity has already been fully returned.
  const allItemsReturned = invoice.items.length > 0 && remainingReturnQty(invoice.items, returns).every(left => left <= 0);

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Invoice"
        message={`Move invoice ${invoice?.invoiceNumber} to bin? You can restore it from the Recycle Bin (GST documents are retained, not auto-purged).`}
        confirmLabel="Move to Bin"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDeleteConfirm(false); }}
      />
      <ConfirmDialog
        open={returnDeleteConfirm !== null}
        title="Delete Credit Note"
        message={`Move credit note ${returnDeleteConfirm?.creditNoteNumber ?? ""} to bin? This reverses the stock it restored. You can restore it from the Recycle Bin (GST documents are retained, not auto-purged).`}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingReturn}
        onConfirm={handleDeleteReturn}
        onCancel={() => { if (!deletingReturn) setReturnDeleteConfirm(null); }}
      />
      <ConfirmDialog
        open={paymentDeleteConfirm !== null}
        title="Delete Payment"
        message={`Delete this ₹${paymentDeleteConfirm ? fmt(paymentDeleteConfirm.amount) : ""} payment via ${paymentDeleteConfirm?.method ?? ""}? The invoice's paid amount and status will be recalculated.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingPayment}
        onConfirm={handleDeletePayment}
        onCancel={() => { if (!deletingPayment) setPaymentDeleteConfirm(null); }}
      />
      <Modal
        open={editingPayment !== null}
        title="Edit Payment"
        onClose={() => { if (!savingPaymentEdit) setEditingPayment(null); }}
        variant="fullscreen"
        maxWidth="26rem"
        footer={
          <>
            <Button type="button" variant="secondary" disabled={savingPaymentEdit} onClick={() => setEditingPayment(null)}>Cancel</Button>
            <Button type="submit" form="edit-payment-form" variant="primary" loading={savingPaymentEdit} disabled={savingPaymentEdit || !editPaymentDirty.isDirty}>Save</Button>
          </>
        }
      >
        <form id="edit-payment-form" className={styles.formCol} onSubmit={handleEditPaymentSubmit} noValidate>
          <FormField label="Amount (₹)" error={editPaymentAmountError} required>
            <Input
              type="text"
              inputMode="decimal"
              value={editPaymentForm.amount}
              onChange={(e) => { setEditPaymentForm((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, "") })); setEditPaymentAmountError(undefined); }}
              autoFocus
              disabled={savingPaymentEdit}
            />
          </FormField>
          <FormField label="Date" error={editPaymentDateError}>
            <Input
              type="date"
              value={editPaymentForm.date}
              onChange={(e) => { setEditPaymentForm((p) => ({ ...p, date: e.target.value })); setEditPaymentDateError(undefined); }}
              min={invoice ? toIstDateStr(new Date(invoice.date)) : undefined}
              max={toIstDateStr(new Date())}
              disabled={savingPaymentEdit}
            />
          </FormField>
          <FormField label="Method">
            <Select
              value={editPaymentForm.method}
              onChange={(e) => { setEditPaymentForm((p) => ({ ...p, method: e.target.value })); setEditPaymentOtherMethodError(undefined); }}
              disabled={savingPaymentEdit}
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </FormField>
          {editPaymentForm.method === "Other" && (
            <FormField label="Specify Method" error={editPaymentOtherMethodError} required>
              <Input
                type="text"
                value={editPaymentOtherMethod}
                onChange={(e) => { setEditPaymentOtherMethod(e.target.value); setEditPaymentOtherMethodError(undefined); }}
                disabled={savingPaymentEdit}
              />
            </FormField>
          )}
          <FormField label="Reference / UTR (optional)">
            <Input
              type="text"
              value={editPaymentForm.reference}
              onChange={(e) => setEditPaymentForm((p) => ({ ...p, reference: e.target.value }))}
              maxLength={500}
              disabled={savingPaymentEdit}
            />
          </FormField>
        </form>
      </Modal>
      {invoice.createdBy?.id && (
        <ReassignOwnerModal
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          entityLabel="Invoice"
          documentLabel={invoice.invoiceNumber}
          currentUserId={invoice.createdBy.id}
          currentUserName={invoice.createdBy.name}
          saving={reassigning}
          onSave={handleReassign}
        />
      )}
      <PdfCopyDialog
        open={pdfCopyDialogOpen}
        loading={pdfDownloading}
        onConfirm={handleDownloadConfirm}
        onCancel={() => { if (!pdfDownloading) setPdfCopyDialogOpen(false); }}
      />
      <Modal
        open={emailModalOpen}
        title="Email Invoice"
        onClose={() => { if (!sendingEmail) setEmailModalOpen(false); }}
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" disabled={sendingEmail} onClick={() => setEmailModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="invoice-email-form" variant="primary" loading={sendingEmail} disabled={sendingEmail}>Send</Button>
          </>
        }
      >
        <form id="invoice-email-form" onSubmit={handleSendEmail} noValidate>
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
      {pdfPreviewUrl && invoice && (
        <PdfPreviewModal
          url={pdfPreviewUrl}
          fileName={invoice.invoiceNumber}
          title={invoice.invoiceNumber}
          subtitle={invoice.customer?.name}
          onClose={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}
        />
      )}
      {shareLoading && <OverlayLoader text="Preparing PDF…" />}
      {sendingEmail && <OverlayLoader text="Sending email…" />}
      {pdfPrinting && <OverlayLoader text="Preparing PDF…" />}
      {pdfViewing && <OverlayLoader text="Preparing PDF…" />}
      {pdfRegenerating && <OverlayLoader text="Regenerating PDF…" />}
      {addingPayment && <OverlayLoader text="Saving payment…" />}
      {savingPaymentEdit && <OverlayLoader text="Updating payment…" />}
      {deletingPayment && <OverlayLoader text="Deleting payment…" />}
      {addingReturn && <OverlayLoader text="Saving return…" />}
      {deletingReturn && <OverlayLoader text="Deleting credit note…" />}
      {creditNoteToRender && <OverlayLoader text="Preparing credit note PDF…" />}
      {openingEdit && <OverlayLoader text="Opening editor…" />}
      {reassigning && <OverlayLoader text="Reassigning…" />}

      <PrintAreaStyles />

      <div className="page-stack">
        {/* Toolbar */}
        <div className="page-header">
          <div>
            <Breadcrumb items={[{ label: "Invoices", href: "/sales/invoices" }, { label: invoice.invoiceNumber }]} />
            {(invoice.createdBy?.name || invoice.createdAt) && (
              <div className={styles.metaText}>
                {invoice.createdBy?.name && <>Created by {invoice.createdBy.name}</>}
                {invoice.createdAt && <> · {formatDateTime(invoice.createdAt)}</>}
              </div>
            )}
            {isAdmin && invoice.createdBy?.id && (
              <button type="button" className={styles.linkButton} onClick={() => setReassignOpen(true)}>Reassign</button>
            )}
          </div>
          <div className={styles.toolbarActions}>
            <StatusBadge status={invoice.status} />
            {canWrite && (
              <Button
                variant="editOutline" size="sm"
                disabled={invoice.status === "paid"}
                title={invoice.status === "paid" ? "Invoice is fully paid — nothing left to edit" : undefined}
                onClick={() => { setOpeningEdit(true); router.push(`/sales/invoices/${id}/edit`); }}
              ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Edit Invoice</Button>
            )}
            {canWrite && balance > 0 && (
              <Button
                variant="greenPrimary"
                size="sm"
                onClick={() => {
                  setShowPaymentForm((v) => {
                    const next = !v;
                    if (next) {
                      setPaymentForm({ amount: "", method: "Cheque", reference: "", date: toIstDateStr(new Date()) });
                      setPaymentOtherMethod("");
                      setPaymentAmountError(undefined);
                      setPaymentDateError(undefined);
                      setPaymentOtherMethodError(undefined);
                    }
                    return next;
                  });
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                {showPaymentForm ? "Hide Payment" : "Record Payment"}
              </Button>
            )}
            {canWrite && (
            <span
              title={
                invoice.paidAmount <= 0
                  ? "No payment received yet — pay first to enable returns"
                  : allItemsReturned
                    ? "All items on this invoice have already been returned"
                    : undefined
              }
              className={styles.inlineFlex}
            >
              <Button variant="secondary" size="sm" disabled={invoice.paidAmount <= 0 || allItemsReturned} onClick={openReturnForm}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                {allItemsReturned ? "All Items Returned" : "Record Return"}
              </Button>
            </span>
            )}
            <Button variant="secondary" size="sm" title="Discard the cached PDF and view a freshly generated copy" aria-label="Regenerate PDF" onClick={handleRegeneratePdf}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
            </Button>
            <Button variant="viewOutline" size="sm" onClick={handleViewPdf} loading={pdfViewing}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              View
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownloadClick}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              PDF
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              Print
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
                    // Ensure the dropdown's left edge stays ≥8px from viewport left
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
              {shareOpen && (
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
                      canWrite ? {
                        key: "email", label: "Email",
                        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
                        color: "var(--c-text-2)",
                      } : null,
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
            {canWrite && (
            <Button variant="dangerOutline" size="sm" disabled={deleting} onClick={() => setDeleteConfirm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
              Delete
            </Button>
            )}
          </div>
        </div>

        {/* Payment form */}
        {showPaymentForm && (
          <div className={`card ${styles.paymentFormCard}`}>
            <h3 className={styles.paymentFormTitle}>Record Payment</h3>
            <form onSubmit={handleAddPayment} noValidate>
              <div className={styles.paymentFormRow}>
                <FormField label="Amount (₹)" error={paymentAmountError} required>
                  <div className={styles.paymentAmountRow}>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={paymentForm.amount}
                      onChange={(e) => { setPaymentForm((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, "") })); setPaymentAmountError(undefined); }}
                      placeholder={`e.g. ${balance.toFixed(2)}`}
                      sz="sm"
                      className={styles.paymentAmountInput}
                      autoFocus
                    />
                    <FillMaxButton
                      onClick={() => setPaymentForm((p) => ({ ...p, amount: balance.toFixed(2) }))}
                      label={`Full ₹${fmt(balance)}`}
                      variant="green"
                    />
                  </div>
                </FormField>
                <div className={styles.paymentDateField}>
                  <FormField label="Date" error={paymentDateError}>
                    <Input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) => { setPaymentForm((p) => ({ ...p, date: e.target.value })); setPaymentDateError(undefined); }}
                      min={toIstDateStr(new Date(invoice.date))}
                      max={toIstDateStr(new Date())}
                      sz="sm"
                    />
                  </FormField>
                </div>
                <div className={styles.paymentMethodField}>
                  <FormField label="Method">
                    <Select
                      value={paymentForm.method}
                      onChange={(e) => { setPaymentForm((p) => ({ ...p, method: e.target.value })); setPaymentOtherMethodError(undefined); }}
                      sz="sm"
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </FormField>
                </div>
                {paymentForm.method === "Other" && (
                  <div className={styles.paymentOtherMethodField}>
                    <FormField label="Specify Method" error={paymentOtherMethodError} required>
                      <Input
                        type="text"
                        value={paymentOtherMethod}
                        onChange={(e) => { setPaymentOtherMethod(e.target.value); setPaymentOtherMethodError(undefined); }}
                        placeholder="e.g. PayTM Wallet"
                        sz="sm"
                        maxLength={100}
                      />
                    </FormField>
                  </div>
                )}
                <FormField label="Reference / UTR">
                  <Input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                    placeholder="Optional"
                    sz="sm"
                    maxLength={500}
                    className={styles.paymentReferenceInput}
                  />
                </FormField>
                <div className={styles.paymentFormBtnRow}>
                  <Button type="submit" variant="greenPrimary" size="sm" disabled={addingPayment} loading={addingPayment}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
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
        <Modal
          open={showReturnForm}
          title="Record Return"
          onClose={() => { if (!addingReturn) setShowReturnForm(false); }}
          variant="fullscreen"
          maxWidth="34rem"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setShowReturnForm(false)} disabled={addingReturn}>Cancel</Button>
              <Button type="submit" form="record-return-form" variant="primary" disabled={addingReturn || !returnItems.some(ri => ri.selected && ri.qty > 0)} loading={addingReturn}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                Save Return
              </Button>
            </>
          }
        >
          <form id="record-return-form" onSubmit={handleAddReturn} className={styles.returnForm} noValidate>
            {nextCreditNoteNumber && (
              <div className={styles.returnNextNumberRow}>
                <Badge variant="blue" className={styles.returnNextNumberBadge}>Next no.: {nextCreditNoteNumber}</Badge>
              </div>
            )}
            <div className={styles.returnMetaRow}>
              <div>
                <FormField label="Return Date" error={returnDateError}>
                  <Input type="date" sz="sm" value={returnDate} onChange={e => { setReturnDate(e.target.value); setReturnDateError(undefined); }} min={invoice ? toIstDateStr(new Date(invoice.date)) : undefined} max={toIstDateStr(new Date())} className={styles.returnDateInput} />
                </FormField>
              </div>
              <div className={styles.returnNotesField}>
                <FormField label="Notes">
                  <Input type="text" sz="sm" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Optional reason" className={styles.returnNotesInput} maxLength={2000} />
                </FormField>
              </div>
            </div>
            <FormField label="Select Items to Return" error={returnItemsError}>
            <div className={styles.returnItemsList}>
              {returnItems.map((ri, idx) => (
                <div key={idx} className={`${styles.returnItemRow} ${ri.selected ? styles.returnItemRowSelected : ""}`}>
                  <input
                    type="checkbox"
                    aria-label={ri.name}
                    checked={ri.selected}
                    onChange={e => {
                      const checked = e.target.checked;
                      setReturnItems(prev => prev.map((r, i) => i === idx ? { ...r, selected: checked } : r));
                      setReturnItemsError(undefined);
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
                      setReturnItemsError(undefined);
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
            </FormField>
          </form>
        </Modal>

        {/* Invoice print area */}
        <InvoicePrintArea
          invoice={invoice}
          settings={settings}
          returns={returns}
          balance={balance}
          showPaymentInPdf={showPaymentInPdf}
          showReturnInPdf={showReturnInPdf}
        />

        {/* Credit note print area — mounted off-screen only while a credit
            note PDF is being generated, fed to the same generateInvoicePdfBlob()
            pipeline as the main invoice via #credit-note-print-area. */}
        {creditNoteToRender && (
          <CreditNotePrintArea ret={creditNoteToRender} invoice={invoice} settings={settings} />
        )}
        {/* Payment history */}
        <PaymentHistoryCard
          invoice={invoice}
          returns={returns}
          balance={balance}
          canWrite={canWrite}
          showPaymentInPdf={showPaymentInPdf}
          onTogglePdf={() => setShowPaymentInPdf(v => !v)}
          onEdit={openEditPayment}
          onDelete={setPaymentDeleteConfirm}
        />

        {/* Returns history */}
        <ReturnHistoryCard
          returns={returns}
          canWrite={canWrite}
          showReturnInPdf={showReturnInPdf}
          onTogglePdf={() => setShowReturnInPdf(v => !v)}
          creditNoteDownloadingId={creditNoteDownloadingId}
          onDownload={handleDownloadCreditNotePdf}
          onDelete={setReturnDeleteConfirm}
        />
      </div>
    </>
  );
}
