"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { rules, validate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { PurchaseBillFormBody } from "@/components/purchases/PurchaseBillFormBody";
import { RecordPaymentDialog, type PaymentDraft } from "@/components/purchases/RecordPaymentDialog";
import {
  toNum, fmtCurrency, computePurchaseBillTotals, calcPurchaseBillItem,
  type PurchaseBillLineItem, type PurchaseBillProduct, type PurchaseBillVendor,
} from "@/lib/purchaseBillForm";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { getIndianFinancialYear, formatFinancialYearLabel, resolveNumberFormat } from "@/lib/documentNumbering";
import styles from "./billNew.module.css";

// Shown once, only before this business's very first purchase bill, if
// numbering hasn't been customized yet in Settings — mirrors the invoice
// page's nudge (see FIRST_INVOICE_NUDGE_DISMISSED_KEY there).
const FIRST_BILL_NUDGE_DISMISSED_KEY = "sciencehub_first_purchase_bill_nudge_dismissed";

export default function NewPurchaseBillPage() {
  const router = useRouter();
  const toast  = useToast();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);

  const [vendors,  setVendors]  = useState<PurchaseBillVendor[]>([]);
  const [products, setProducts] = useState<PurchaseBillProduct[]>([]);
  const [saving,   setSaving]   = useState(false);

  const [vendorId,  setVendorId]  = useState("");
  const [vendorError, setVendorError] = useState<string | undefined>(undefined);
  const [billDate,  setBillDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [billDateError, setBillDateError] = useState<string | undefined>(undefined);
  const [dueDate,   setDueDate]   = useState("");
  const [dueDateError, setDueDateError] = useState<string | undefined>(undefined);
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  // Snapshot of the items array the current itemsError was raised against —
  // lets the error auto-hide the moment the items list itself changes (add/
  // remove/edit a line) without setting state from inside an effect.
  const [itemsErrorFor, setItemsErrorFor] = useState<PurchaseBillLineItem[] | null>(null);
  const [paymentDateError, setPaymentDateError] = useState<string | undefined>(undefined);
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<PurchaseBillLineItem[]>([]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Optional: record payment immediately, via a popup dialog
  const [showFirstBillNudge, setShowFirstBillNudge] = useState(false);
  const [firstBillPreviewNumber, setFirstBillPreviewNumber] = useState("");

  const [addPayment,   setAddPayment]   = useState(false);
  const [payAmount,    setPayAmount]    = useState("");
  const [payMethod,    setPayMethod]    = useState("Cash");
  const [payReference, setPayReference] = useState("");
  const [payDate,      setPayDate]      = useState(() => new Date().toISOString().slice(0, 10));
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  function handleSavePayment(payment: PaymentDraft) {
    setPayAmount(payment.amount);
    setPayMethod(payment.method);
    setPayReference(payment.reference);
    setPayDate(payment.date);
    setAddPayment(true);
    setShowPaymentDialog(false);
    setPaymentDateError(undefined);
  }

  function removePayment() {
    setAddPayment(false);
    setPayAmount("");
    setPayReference("");
    setPaymentDateError(undefined);
  }

  useEffect(() => {
    fetch("/api/vendors?pageSize=5000", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then((res: { data: PurchaseBillVendor[] }) => setVendors(res.data ?? [])).catch(() => {});
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
  }, []);

  function dismissFirstBillNudge() {
    localStorage.setItem(FIRST_BILL_NUDGE_DISMISSED_KEY, "1");
    setShowFirstBillNudge(false);
  }

  // The itemsError message auto-hides once the items array it was raised
  // against has since changed (add/remove/edit a line) — see itemsErrorFor.
  const visibleItemsError = itemsError && itemsErrorFor === items ? itemsError : undefined;

  const { grossTotal, itemDiscountTotal, taxTotal, roundOff, grandTotal } = computePurchaseBillTotals(items, discount);
  const subtotal = grossTotal - itemDiscountTotal;
  const disc = toNum(discount);

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/purchase-bills/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAttachmentUrl(data.url);
        setAttachmentName(data.name);
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

  function removeAttachment() {
    // Never saved to a bill yet, so it's safe to discard the blob right away.
    if (attachmentUrl) {
      fetch("/api/purchase-bills/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: attachmentUrl }),
      }).catch(() => {});
    }
    setAttachmentUrl(null);
    setAttachmentName(null);
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
    if (items.some(i => validate(i.quantity, rules.required(), rules.positiveNumber())))      { flagItemsError("All quantities must be greater than 0."); return; }
    if (items.some(i => validate(i.purchasePrice, rules.required(), rules.positiveNumber()))) { flagItemsError("All item prices must be greater than 0."); return; }
    setItemsError(undefined);
    if (billDate > new Date().toISOString().slice(0, 10)) { setBillDateError("Bill date cannot be in the future."); return; }
    setBillDateError(undefined);
    if (dueDate && dueDate < billDate)               { setDueDateError("Due date cannot be before the bill date."); return; }
    setDueDateError(undefined);
    if (addPayment && toNum(payAmount) > 0 && payDate < billDate) { setPaymentDateError("Payment date cannot be before the bill date."); return; }
    if (addPayment && toNum(payAmount) > 0 && payDate > new Date().toISOString().slice(0, 10)) { setPaymentDateError("Payment date cannot be in the future."); return; }
    setPaymentDateError(undefined);

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
        bustCachePrefix("/api/purchase-bills");
        bustCachePrefix("/api/products");
        toast({ type: "success", title: "Bill created", message: `${data.billNumber} saved.` });
        router.push(`/purchases/bills/${data.id}`);
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
  const canSubmit = !saving && !attachmentUploading && !missingVendor && !noItems;

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
        <p className="page-sub">Record a GST-compliant purchase bill</p>
      </div>
      {showFirstBillNudge && (
        <InfoBanner
          message={`This is your first purchase bill — it will be numbered "${firstBillPreviewNumber}" by default. Want a different prefix or starting number?`}
          actionHref="/settings#numbering"
          actionLabel="Customize in Settings →"
          onDismiss={dismissFirstBillNudge}
        />
      )}

      <form onSubmit={handleSubmit} noValidate>
        <PurchaseBillFormBody
          vendors={vendors}
          vendorId={vendorId}
          onVendorIdChange={(id) => { setVendorId(id); setVendorError(undefined); }}
          onVendorCreated={(v) => setVendors(prev => [...prev, v])}
          onVendorUpdated={(v) => setVendors(prev => prev.map(p => p.id === v.id ? v : p))}
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
          onAttachmentFileChange={handleAttachmentChange}
          onAttachmentRemove={removeAttachment}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
          itemsError={visibleItemsError}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
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
                    <button type="button" className={styles.recordPaymentLink} onClick={() => setShowPaymentDialog(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Record payment now
                    </button>
                  )}
                </div>
              )}

              {(missingVendor || noItems) && (
                <div className={styles.warningList}>
                  {missingVendor && <p className={styles.warningItem}>• Select a vendor</p>}
                  {noItems && <p className={styles.warningItem}>• Add at least one item</p>}
                </div>
              )}
              <div className="summary-actions">
                <Button type="submit" variant="primary" size="full" disabled={!canSubmit}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  Create Purchase Bill
                </Button>
                <Button variant="secondary" size="full" href="/purchases/bills">
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
