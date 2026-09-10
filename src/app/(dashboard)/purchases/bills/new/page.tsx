"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { rules, validate, toIstDateStr, isFutureIstDate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Badge } from "@/components/ui/Badge";
import { bustCache, bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { PurchaseBillFormBody } from "@/components/purchases/PurchaseBillFormBody";
import { RecordPaymentDialog, type PaymentDraft } from "@/components/purchases/RecordPaymentDialog";
import {
  toNum, fmtCurrency, computePurchaseBillTotals, calcPurchaseBillItem,
  type PurchaseBillLineItem, type PurchaseBillProduct,
} from "@/lib/purchaseBillForm";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";
import { getIndianFinancialYear, formatFinancialYearLabel, resolveNumberFormat } from "@/lib/documentNumbering";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import styles from "./billNew.module.css";

// Shown once before the business's first purchase bill, if numbering is still default.
const FIRST_BILL_NUDGE_DISMISSED_KEY = "sciencehub_first_purchase_bill_nudge_dismissed";

// Mirrors MAX_SIZE in src/app/api/purchase-bills/upload/route.ts — client-side reject before upload.
const MAX_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;

export default function NewPurchaseBillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast  = useToast();
  const { data: session } = useSession();
  const idempotency = useIdempotencyKey();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);

  const [products, setProducts] = useState<PurchaseBillProduct[]>([]);
  const [saving,   setSaving]   = useState(false);

  const [vendorId,  setVendorId]  = useState("");
  const [vendorError, setVendorError] = useState<string | undefined>(undefined);
  const [billDate,  setBillDate]  = useState(() => toIstDateStr(new Date()));
  const [billDateError, setBillDateError] = useState<string | undefined>(undefined);
  const [dueDate,   setDueDate]   = useState("");
  const [dueDateError, setDueDateError] = useState<string | undefined>(undefined);
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  // Snapshot items array at error-time so the error auto-hides once items change, without an effect.
  const [itemsErrorFor, setItemsErrorFor] = useState<PurchaseBillLineItem[] | null>(null);
  const [paymentDateError, setPaymentDateError] = useState<string | undefined>(undefined);
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<PurchaseBillLineItem[]>([]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState<number | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // Defaults off — most bills don't carry a transport charge.
  const [transportChargeEnabled, setTransportChargeEnabled] = useState(false);
  const [transportCharge, setTransportCharge] = useState("");
  const [transportChargeGstRate, setTransportChargeGstRate] = useState("18");
  const [transportChargeError, setTransportChargeError] = useState<string | undefined>(undefined);

  // Optional: record payment immediately, via a popup dialog
  const [showFirstBillNudge, setShowFirstBillNudge] = useState(false);
  const [firstBillPreviewNumber, setFirstBillPreviewNumber] = useState("");
  // Always-shown preview of the number this bill will get if saved right now (see
  // /api/purchase-bills/next-number) — refetched whenever billDate changes, since the bill's FY
  // segment (and so its whole number) is derived from billDate, not "now".
  const [nextBillNumber, setNextBillNumber] = useState("");

  const [addPayment,   setAddPayment]   = useState(false);
  const [payAmount,    setPayAmount]    = useState("");
  const [payMethod,    setPayMethod]    = useState("IMPS");
  const [payReference, setPayReference] = useState("");
  const [payDate,      setPayDate]      = useState(() => toIstDateStr(new Date()));
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  function handleSavePayment(payment: PaymentDraft) {
    setPayAmount(payment.amount);
    setPayMethod(payment.method);
    setPayReference(payment.reference);
    setPayDate(payment.date);
    setAddPayment(true);
    setShowPaymentDialog(false);
    setPaymentDateError(undefined);
    toast({ type: "success", title: "Payment added", message: `₹${fmtCurrency(toNum(payment.amount))} will be recorded when this bill is saved.` });
  }

  function removePayment() {
    setAddPayment(false);
    setPayAmount("");
    setPayReference("");
    setPaymentDateError(undefined);
  }

  useEffect(() => {
    // BillDetailsCard resolves this id to full vendor details itself (GET /api/vendors/[id]) —
    // no need to prefetch/validate against the full vendor list here. One-time sync from the
    // initial URL (an external system) on mount — a legitimate effect, not state derivable from render.
    const prefillVendorId = searchParams.get("vendorId");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefillVendorId) setVendorId(prefillVendorId);
    fetch("/api/products?pageSize=5000", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then((res: { data: PurchaseBillProduct[] }) => setProducts(res.data ?? [])).catch(() => {});
    fetch("/api/settings", { headers: { "x-no-loader": "1" } }).then((r) => r.json()).then((s) => {
      const numberingUntouched = !s?.purchaseBillNumberPrefix && !s?.nextPurchaseBillNumberOverride && !s?.purchaseBillNumberFormat;
      if (!numberingUntouched || localStorage.getItem(FIRST_BILL_NUDGE_DISMISSED_KEY)) return;
      const prefix = s?.purchaseBillNumberPrefix || "PB";
      const fyLabel = formatFinancialYearLabel(getIndianFinancialYear(new Date()));
      setFirstBillPreviewNumber(resolveNumberFormat(s?.purchaseBillNumberFormat).render(prefix, fyLabel, 1));
      fetch("/api/purchase-bills?page=1&pageSize=1", { headers: { "x-no-loader": "1" } })
        .then((r) => r.json())
        .then((res: { total?: number }) => { if ((res.total ?? 0) === 0) setShowFirstBillNudge(true); })
        .catch(() => {});
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time mount prefill from the initial URL, not meant to re-run on searchParams changes
  }, []);

  function dismissFirstBillNudge() {
    localStorage.setItem(FIRST_BILL_NUDGE_DISMISSED_KEY, "1");
    setShowFirstBillNudge(false);
  }

  useEffect(() => {
    if (!billDate) return;
    const controller = new AbortController();
    fetch(`/api/purchase-bills/next-number?billDate=${encodeURIComponent(billDate)}`, { headers: { "x-no-loader": "1" }, signal: controller.signal })
      .then((r) => r.json())
      .then((res: { documentNumber?: string }) => setNextBillNumber(res.documentNumber ?? ""))
      .catch(() => {});
    return () => controller.abort();
  }, [billDate]);

  const DRAFT_KEY = "bill:new";
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  type BillNewDraft = {
    vendorId: string; billDate: string; dueDate: string; category: string; discount: string; notes: string;
    items: PurchaseBillLineItem[]; attachmentUrl: string | null; attachmentName: string | null; attachmentSize: number | null;
    transportChargeEnabled: boolean; transportCharge: string; transportChargeGstRate: string;
    addPayment: boolean; payAmount: string; payMethod: string; payReference: string; payDate: string;
  };

  useEffect(() => {
    const draft = loadFormDraft<BillNewDraft>(DRAFT_KEY, (stale) => {
      // The draft aged past DRAFT_MAX_AGE_MS and was just silently wiped — without this, an
      // uploaded-but-never-saved attachment it referenced would stay orphaned in Blob storage
      // forever, since nothing else ever gets a chance to see what this expired draft held.
      if (stale.attachmentUrl) discardUnsavedAttachment(stale.attachmentUrl);
    });
    const v = draft?.values;
    const hasContent = !!v && (!!v.vendorId || v.items?.length > 0 || !!v.notes?.trim());
    // One-time sync from localStorage (an external system) on mount — a legitimate effect, not
    // state derivable from props/render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasContent) setShowDraftBanner(true);
    else setDraftReady(true);
  }, []);

  function restoreDraft() {
    const draft = loadFormDraft<BillNewDraft>(DRAFT_KEY);
    if (draft?.values) {
      const v = draft.values;
      setVendorId(v.vendorId ?? "");
      setBillDate(v.billDate ?? toIstDateStr(new Date()));
      setDueDate(v.dueDate ?? "");
      setCategory(v.category ?? "");
      setDiscount(v.discount ?? "0");
      setNotes(v.notes ?? "");
      setItems(v.items ?? []);
      setAttachmentUrl(v.attachmentUrl ?? null);
      setAttachmentName(v.attachmentName ?? null);
      setAttachmentSize(v.attachmentSize ?? null);
      setTransportChargeEnabled(v.transportChargeEnabled ?? true);
      setTransportCharge(v.transportCharge ?? "");
      setTransportChargeGstRate(v.transportChargeGstRate ?? "18");
      setAddPayment(v.addPayment ?? false);
      setPayAmount(v.payAmount ?? "");
      setPayMethod(v.payMethod ?? "IMPS");
      setPayReference(v.payReference ?? "");
      setPayDate(v.payDate ?? toIstDateStr(new Date()));
    }
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  function dismissDraft() {
    setConfirmDiscardDraftOpen(true);
  }

  function discardDraft() {
    // A draft captured mid-fill (see useFormDraft below) can include an uploaded-but-never-saved
    // attachment's URL — discarding without checking this left that blob orphaned in storage forever.
    const draft = loadFormDraft<BillNewDraft>(DRAFT_KEY);
    if (draft?.values.attachmentUrl) discardUnsavedAttachment(draft.values.attachmentUrl);
    clearFormDraft(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftReady(true);
    setConfirmDiscardDraftOpen(false);
  }

  useFormDraft(DRAFT_KEY, {
    vendorId, billDate, dueDate, category, discount, notes, items, attachmentUrl, attachmentName, attachmentSize,
    transportChargeEnabled, transportCharge, transportChargeGstRate,
    addPayment, payAmount, payMethod, payReference, payDate,
  }, !draftReady || saving);

  // The itemsError message auto-hides once the items array it was raised
  // against has since changed (add/remove/edit a line) — see itemsErrorFor.
  const visibleItemsError = itemsError && itemsErrorFor === items ? itemsError : undefined;

  const effectiveTransportCharge = transportChargeEnabled ? (toNum(transportCharge)) : 0;
  const effectiveTransportGstRate = transportChargeEnabled ? (toNum(transportChargeGstRate)) : 0;
  const { grossTotal, itemDiscountTotal, taxTotal, roundOff, grandTotal, transportChargeGstAmount } =
    computePurchaseBillTotals(items, discount, effectiveTransportCharge, effectiveTransportGstRate);
  const subtotal = grossTotal - itemDiscountTotal;
  const disc = toNum(discount);

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
      toast({ type: "error", title: "File too large", message: "File must be under 10 MB." });
      e.target.value = "";
      return;
    }
    setAttachmentUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/purchase-bills/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAttachmentUrl(data.url);
        setAttachmentName(data.name);
        setAttachmentSize(typeof data.size === "number" ? data.size : null);
        toast({ type: "success", title: "File uploaded", message: `${data.name} uploaded successfully.` });
      } else {
        toast({ type: "error", title: "Upload failed", message: data.error ?? "Could not upload file." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Could not upload file." });
    }
    setAttachmentUploading(false);
    e.target.value = "";
  }

  function discardUnsavedAttachment(url: string) {
    // keepalive: true — Cancel navigates away right after this fires; without it, the browser can
    // abort an in-flight, not-yet-awaited fetch when the page unloads, leaving the blob orphaned.
    fetch("/api/purchase-bills/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      keepalive: true,
    }).catch(() => {});
  }

  function removeAttachment() {
    // Never saved to a bill yet, so it's safe to discard the blob right away.
    if (attachmentUrl) discardUnsavedAttachment(attachmentUrl);
    setAttachmentUrl(null);
    setAttachmentName(null);
    setAttachmentSize(null);
  }

  // Cancel leaves an uploaded-but-never-saved attachment orphaned in Blob storage forever unless
  // discarded here — a plain href link (no onClick) previously skipped this entirely.
  function handleCancel() {
    if (attachmentUrl) discardUnsavedAttachment(attachmentUrl);
    router.push("/purchases/bills");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attachmentUploading) { toast({ type: "error", title: "Check form", message: "Please wait for the attachment to finish uploading." }); return; }
    const vendorErr = validate(vendorId, rules.required("Please select a vendor."));
    setVendorError(vendorErr ?? undefined);
    if (vendorErr)                                                      { return; }
    function flagItemsError(message: string) { setItemsError(message); setItemsErrorFor(items); }
    if (items.length === 0)                                             { flagItemsError("Add at least one item."); return; }
    if (items.some(i => validate(i.name, rules.required())))            { flagItemsError("All items must have a name."); return; }
    if (items.some(i => validate(i.unit, rules.required())))            { flagItemsError("All items must have a unit."); return; }
    if (items.some(i => validate(i.quantity, rules.required(), rules.positiveNumber())))      { flagItemsError("All quantities must be greater than 0."); return; }
    if (items.some(i => validate(i.purchasePrice, rules.required(), rules.positiveNumber()))) { flagItemsError("All item prices must be greater than 0."); return; }
    if (items.some(i => validate(i.gstRate, rules.required(), rules.percentRange(100))))       { flagItemsError("All items must have a GST rate between 0 and 100%."); return; }
    setItemsError(undefined);
    if (isFutureIstDate(billDate)) { setBillDateError("Bill date cannot be in the future."); return; }
    setBillDateError(undefined);
    if (dueDate && dueDate < billDate)               { setDueDateError("Due date cannot be before the bill date."); return; }
    setDueDateError(undefined);
    if (addPayment && toNum(payAmount) > 0 && payDate < billDate) { setPaymentDateError("Payment date cannot be before the bill date."); return; }
    if (addPayment && toNum(payAmount) > 0 && isFutureIstDate(payDate)) { setPaymentDateError("Payment date cannot be in the future."); return; }
    setPaymentDateError(undefined);
    if (missingTransportAmount) {
      setTransportChargeError("Enter the transport charge amount.");
      return;
    }
    if (missingTransportGstRate) {
      setTransportChargeError("Enter a GST rate for the transport charge.");
      return;
    }
    setTransportChargeError(undefined);

    const billItems = items.map(i => {
      const { discountAmount, gstAmount, total } = calcPurchaseBillItem(i);
      return {
        productId:       i.productId || null,
        name:            i.name.trim(),
        hsn:             i.hsn.trim(),
        unit:            i.unit,
        quantity:        toNum(i.quantity),
        purchasePrice:   toNum(i.purchasePrice),
        discountPercent: toNum(i.discountPercent),
        gstRate:         toNum(i.gstRate),
        discountAmount,
        gstAmount,
        total,
      };
    });

    const payload: Record<string, unknown> = {
      vendorId,
      billDate,
      dueDate:  dueDate || null,
      category: category || null,
      discount: disc,
      subtotal,
      taxAmount: taxTotal,
      total:     grandTotal,
      notes:     notes.trim() || null,
      items:     billItems,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      transportCharge: effectiveTransportCharge,
      transportChargeGstRate: effectiveTransportGstRate,
      idempotencyKey: idempotency.key(),
    };

    if (addPayment && toNum(payAmount) > 0) {
      payload.payment = {
        amount:    toNum(payAmount),
        method:    payMethod,
        reference: payReference.trim() || null,
        date:      payDate,
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/purchase-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        clearFormDraft(DRAFT_KEY);
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/products");
        bustCachePrefix("/api/reports");
        bustCachePrefix("/api/purchase-reports");
        bustCache("/api/units");
        toast({ type: "success", title: "Bill created", message: `${data.billNumber} saved.` });
        router.push(`/purchases/bills/${data.id}`);
        // No setSaving(false) here — page is navigating away; resetting it first would briefly
        // re-enable Save mid-transition and allow a duplicate create submission.
        return;
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to create purchase bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  const missingVendor = !vendorId;
  const noItems = items.length === 0;
  // Once the toggle is on, both amount and GST rate are mandatory — a blank amount must not silently save as zero.
  const missingTransportAmount = transportChargeEnabled && (!transportCharge.trim() || effectiveTransportCharge <= 0);
  const missingTransportGstRate = transportChargeEnabled && !transportChargeGstRate.trim();
  const missingTransportCharge = missingTransportAmount || missingTransportGstRate;
  const canSubmit = !saving && !attachmentUploading && !missingVendor && !noItems && !missingTransportCharge;

  return (
    <>
    {saving && <OverlayLoader text="Creating bill…" />}
    <RecordPaymentDialog
      open={showPaymentDialog}
      billDate={billDate}
      grandTotal={grandTotal}
      initial={{ amount: payAmount, method: payMethod, reference: payReference, date: payDate }}
      onCancel={() => setShowPaymentDialog(false)}
      onSave={handleSavePayment}
    />
    <div className="page-stack">
      <Breadcrumb items={[{ label: "Purchases", href: "/purchases/bills" }, { label: "New Purchase Bill" }]} />
      <div>
        <h1 className="page-title">Create Purchase Bill</h1>
        <p className="page-sub">
          Record a GST-compliant purchase bill
          {nextBillNumber && (
            <Badge variant="blue" className={styles.nextNumberBadge}>Next no.: {nextBillNumber}</Badge>
          )}
        </p>
      </div>
      <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />

      <form onSubmit={handleSubmit} noValidate>
        <PurchaseBillFormBody
          banner={
            <>
              {showDraftBanner && (
                <InfoBanner
                  message="You have an unsaved purchase bill draft from earlier — want to resume it?"
                  actionLabel="Resume draft"
                  onAction={restoreDraft}
                  onDismiss={dismissDraft}
                />
              )}
              {showFirstBillNudge && (
                <InfoBanner
                  message={`This is your first purchase bill — it will be numbered "${firstBillPreviewNumber}" by default. Want a different prefix or starting number?`}
                  actionHref="/settings#numbering"
                  actionLabel={<>Customize in Settings <ArrowIcon /></>}
                  onDismiss={dismissFirstBillNudge}
                />
              )}
            </>
          }
          vendorId={vendorId}
          onVendorIdChange={(id) => { setVendorId(id); setVendorError(undefined); }}
          vendorError={vendorError}
          category={category}
          onCategoryChange={setCategory}
          billDate={billDate}
          onBillDateChange={(v) => { setBillDate(v); setBillDateError(undefined); }}
          billDateError={billDateError}
          dueDate={dueDate}
          onDueDateChange={(v) => { setDueDate(v); setDueDateError(undefined); }}
          dueDateError={dueDateError}
          notes={notes}
          onNotesChange={setNotes}
          attachmentUploading={attachmentUploading}
          attachmentName={attachmentName}
          attachmentSize={attachmentSize}
          onAttachmentFileChange={handleAttachmentChange}
          onAttachmentRemove={removeAttachment}
          transportChargeEnabled={transportChargeEnabled}
          onToggleTransportCharge={() => { setTransportChargeEnabled((v) => !v); setTransportChargeError(undefined); }}
          transportCharge={transportCharge}
          onTransportChargeChange={(v) => { setTransportCharge(v); setTransportChargeError(undefined); }}
          transportChargeGstRate={transportChargeGstRate}
          onTransportChargeGstRateChange={(v) => { setTransportChargeGstRate(v); setTransportChargeError(undefined); }}
          transportChargeError={transportChargeError}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
          itemsError={visibleItemsError}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
          transportChargeGstAmount={transportChargeGstAmount}
          roundOff={roundOff}
          grandTotal={grandTotal}
          discount={discount}
          onDiscountChange={setDiscount}
          footer={
            <>
              {/* Optional Payment — only meaningful once the bill actually has a
                  total; recording a payment against a ₹0 bill has nothing to pay. */}
              {grandTotal > 0 && (
                <div className={styles.paymentSection}>
                  {addPayment ? (
                    <div className={styles.paymentSummary}>
                      <div className={styles.paymentSummaryInfo}>
                        <span className={styles.paymentSummaryAmount}>₹{fmtCurrency(toNum(payAmount))}</span>
                        <span className={styles.paymentSummarySub}>{payMethod} · {payDate}{payReference ? ` · ${payReference}` : ""}</span>
                      </div>
                      <div className={styles.paymentSummaryActions}>
                        <button type="button" className={styles.paymentSummaryBtn} onClick={() => setShowPaymentDialog(true)}>Edit</button>
                        <button type="button" className={styles.paymentSummaryBtn} onClick={removePayment}>Remove</button>
                      </div>
                    </div>
                  ) : null}
                  {paymentDateError && <p className={styles.paymentDateErrorMsg} role="alert">{paymentDateError}</p>}
                  {!addPayment && (
                    <button type="button" className={styles.recordPaymentLink} onClick={() => { setPayMethod("IMPS"); setShowPaymentDialog(true); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Record payment now
                    </button>
                  )}
                </div>
              )}

              {(missingVendor || noItems || missingTransportCharge) && (
                <div className={styles.warningList}>
                  {missingVendor && <p className={styles.warningItem}>• Select a vendor</p>}
                  {noItems && <p className={styles.warningItem}>• Add at least one item</p>}
                  {missingTransportAmount && <p className={styles.warningItem}>• Enter the transport charge amount</p>}
                  {!missingTransportAmount && missingTransportGstRate && <p className={styles.warningItem}>• Enter a GST rate for the transport charge</p>}
                </div>
              )}
              <div className="summary-actions">
                <Button type="submit" variant="primary" size="full" disabled={!canSubmit}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  Create Purchase Bill
                </Button>
                <Button variant="secondary" size="full" onClick={handleCancel}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Cancel
                </Button>
              </div>
            </>
          }
        />
      </form>
    </div>
    </>
  );
}
