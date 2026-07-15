"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Input";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import { BillDetailsCard } from "@/components/purchases/BillDetailsCard";
import { PurchaseBillItemsTable } from "@/components/purchases/PurchaseBillItemsTable";
import { PurchaseBillTotals } from "@/components/purchases/PurchaseBillTotals";
import {
  makeBlankPurchaseBillItem, toNum, fmtCurrency, computePurchaseBillTotals, calcPurchaseBillItem,
  type PurchaseBillLineItem, type PurchaseBillProduct, type PurchaseBillVendor,
} from "@/lib/purchaseBillForm";
import styles from "./billNew.module.css";

const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];

export default function NewPurchaseBillPage() {
  const router = useRouter();
  const toast  = useToast();

  const [vendors,  setVendors]  = useState<PurchaseBillVendor[]>([]);
  const [products, setProducts] = useState<PurchaseBillProduct[]>([]);
  const [saving,   setSaving]   = useState(false);

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [notes,     setNotes]     = useState("");
  const [items,     setItems]     = useState<PurchaseBillLineItem[]>(() => [makeBlankPurchaseBillItem()]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Optional: record payment immediately
  const [addPayment,   setAddPayment]   = useState(false);
  const [payAmount,    setPayAmount]    = useState("");
  const [payMethod,    setPayMethod]    = useState("Cash");
  const [payReference, setPayReference] = useState("");
  const [payDate,      setPayDate]      = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch("/api/vendors", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setVendors).catch(() => {});
    fetch("/api/products", { headers: { "x-no-loader": "1" } }).then(r => r.json()).then(setProducts).catch(() => {});
  }, []);

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

  function validationToast(message: string) {
    toast({ type: "error", title: "Check form", message });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attachmentUploading)                         { validationToast("Please wait for the attachment to finish uploading."); return; }
    if (!vendorId)                                   { validationToast("Please select a vendor."); return; }
    if (items.length === 0)                          { validationToast("Add at least one item."); return; }
    if (items.some(i => !i.name.trim()))             { validationToast("All items must have a name."); return; }
    if (items.some(i => toNum(i.quantity) <= 0))     { validationToast("All quantities must be greater than 0."); return; }
    if (items.some(i => !i.purchasePrice.trim() || toNum(i.purchasePrice) <= 0)) { validationToast("All item prices must be greater than 0."); return; }
    if (dueDate && dueDate < billDate)               { validationToast("Due date cannot be before the bill date."); return; }
    if (addPayment && toNum(payAmount) > 0 && payDate < billDate) { validationToast("Payment date cannot be before the bill date."); return; }
    if (addPayment && toNum(payAmount) > 0 && payDate > new Date().toISOString().slice(0, 10)) { validationToast("Payment date cannot be in the future."); return; }

    const billItems = items.map(i => {
      const { discountAmount, gstAmount, total } = calcPurchaseBillItem(i);
      return {
        productId:       i.productId || null,
        name:            i.name.trim(),
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
        bustCache("/api/purchase-bills");
        bustCache("/api/products");
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

  return (
    <>
    {saving && <OverlayLoader text="Creating bill…" />}
    <div className={`page-stack ${styles.pageWrap}`}>
      <Breadcrumb items={[{ label: "Purchases", href: "/purchases/bills" }, { label: "New Purchase Bill" }]} />
      <h1 className="page-title">New Purchase Bill</h1>

      <form onSubmit={handleSubmit} className="form-stack">

        <BillDetailsCard
          sectionIndex={0}
          vendors={vendors}
          vendorId={vendorId}
          onVendorIdChange={setVendorId}
          onVendorCreated={(v) => setVendors(prev => [...prev, v])}
          category={category}
          onCategoryChange={setCategory}
          billDate={billDate}
          onBillDateChange={setBillDate}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          notes={notes}
          onNotesChange={setNotes}
          attachmentUploading={attachmentUploading}
          attachmentName={attachmentName}
          onAttachmentFileChange={handleAttachmentChange}
          onAttachmentRemove={removeAttachment}
        />

        <PurchaseBillItemsTable
          sectionIndex={1}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
        />

        <PurchaseBillTotals
          sectionIndex={2}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
          roundOff={roundOff}
          grandTotal={grandTotal}
          discount={discount}
          onDiscountChange={setDiscount}
        />

        {/* Optional Payment */}
        <div {...animateSection(3, "form-card")}>
          <label className={styles.paymentCheckboxLabel}>
            <input type="checkbox" checked={addPayment} onChange={e => setAddPayment(e.target.checked)} className={styles.paymentCheckbox} />
            Record payment now
          </label>

          {addPayment && (
            <div className={styles.paymentDetailBox}>
              <div className={`form-grid-2 ${styles.marginBottom1}`}>
                <FormField label="Amount (₹)">
                  <div className={styles.amountRow}>
                    <Input type="number" min="0" step="0.01" max={grandTotal} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max ₹${fmtCurrency(grandTotal)}`} className={styles.amountInput} />
                    <button
                      type="button"
                      onClick={() => setPayAmount(grandTotal.toFixed(2))}
                      title="Fill full bill amount"
                      className={styles.payFullBtn}
                    >
                      Pay Full
                    </button>
                  </div>
                </FormField>
                <FormField label="Payment Date">
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} min={billDate} max={new Date().toISOString().slice(0, 10)} />
                </FormField>
              </div>
              <div className="form-grid-2">
                <FormField label="Method">
                  <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </FormField>
                <FormField label="Reference / UTR">
                  <Input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="e.g. cheque no., UTR…" />
                </FormField>
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Create Purchase Bill
          </Button>
          <Button variant="secondary" href="/purchases/bills">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </Button>
        </div>
      </form>
    </div>
    </>
  );
}
