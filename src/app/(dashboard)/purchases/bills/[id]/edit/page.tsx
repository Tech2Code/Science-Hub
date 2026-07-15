"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { StatusBadge } from "@/components/ui/Badge";
import { bustCache } from "@/lib/useCache";
import { invalidateCachedPdf } from "@/lib/pdfCache";
import { useToast } from "@/components/ui/Toast";
import { useDirty } from "@/lib/useDirty";
import { animateSection } from "@/lib/animateSection";
import { truncateFilename } from "@/lib/truncateFilename";
import { BillDetailsCard } from "@/components/purchases/BillDetailsCard";
import { PurchaseBillItemsTable } from "@/components/purchases/PurchaseBillItemsTable";
import { PurchaseBillTotals } from "@/components/purchases/PurchaseBillTotals";
import {
  toNum, fmtCurrency, computePurchaseBillTotals, calcPurchaseBillItem,
  type PurchaseBillLineItem, type PurchaseBillProduct, type PurchaseBillVendor,
} from "@/lib/purchaseBillForm";
import { computeRoundOff } from "@/lib/roundOff";
import styles from "./edit.module.css";

interface BillItem {
  id: string; name: string; quantity: number; unit: string;
  purchasePrice: number; discountPercent: number; gstRate: number; gstAmount: number; total: number;
  product: { id: string; name: string } | null;
}
interface PurchaseBill {
  id: string; billNumber: string; vendorId: string; billDate: string; dueDate: string | null; updatedAt?: string;
  category: string | null; notes: string | null; status: string;
  subtotal: number; taxAmount: number; discount: number; total: number; paidAmount: number;
  attachmentUrl: string | null; attachmentName: string | null;
  vendor: { id: string; name: string; company: string | null; gstin: string | null };
  items: BillItem[];
}

function loadedItemsToLineItems(items: BillItem[]): PurchaseBillLineItem[] {
  return items.map((item, idx) => ({
    key: `loaded-${item.id ?? idx}`,
    productId: item.product?.id ?? "",
    name: item.name,
    unit: item.unit,
    quantity: String(item.quantity),
    purchasePrice: String(item.purchasePrice),
    gstRate: String(item.gstRate),
    discountPercent: String(item.discountPercent ?? 0),
  }));
}

function Sk({ w = "100%", h = 16, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div className={styles.skeletonBlock} style={{ width: w, height: h, borderRadius: r } as React.CSSProperties} />
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

export default function EditPurchaseBillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast  = useToast();

  const [vendors,  setVendors]  = useState<PurchaseBillVendor[]>([]);
  const [products, setProducts] = useState<PurchaseBillProduct[]>([]);
  const [bill,    setBill]    = useState<PurchaseBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [vendorId,  setVendorId]  = useState("");
  const [billDate,  setBillDate]  = useState("");
  const [dueDate,   setDueDate]   = useState("");
  const [category,  setCategory]  = useState("");
  const [notes,     setNotes]     = useState("");
  const [discount,  setDiscount]  = useState("0");
  const [items,     setItems]     = useState<PurchaseBillLineItem[]>([]);
  const [attachmentUrl,  setAttachmentUrl]  = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // The bill's persisted attachment when the page loaded — used to tell a
  // saved attachment apart from one uploaded this session but not saved yet,
  // so an unsaved upload that gets replaced/removed can be discarded right
  // away instead of orphaning in Blob storage until someone notices.
  const originalAttachmentUrl = useRef<string | null>(null);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

  const { isDirty, markClean } = useDirty({
    vendorId, billDate, dueDate, category, notes, discount, items, attachmentUrl, attachmentName,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/purchase-bills/${id}`, { headers: { "x-no-loader": "1" } }).then(r => r.json()),
      fetch("/api/vendors", { headers: { "x-no-loader": "1" } }).then(r => r.json()),
      fetch("/api/products", { headers: { "x-no-loader": "1" } }).then(r => r.json()),
    ]).then(([b, v, p]) => {
      setBill(b);
      setVendors(v);
      setProducts(p);
      setVendorId(b.vendorId ?? "");
      setBillDate(b.billDate ? b.billDate.slice(0, 10) : "");
      setDueDate(b.dueDate  ? b.dueDate.slice(0, 10)  : "");
      setCategory(b.category ?? "");
      setNotes(b.notes ?? "");
      setDiscount(String(b.discount ?? 0));
      const lineItems = loadedItemsToLineItems(b.items ?? []);
      setItems(lineItems);
      setAttachmentUrl(b.attachmentUrl ?? null);
      setAttachmentName(b.attachmentName ?? null);
      originalAttachmentUrl.current = b.attachmentUrl ?? null;
      setLoadedUpdatedAt(b.updatedAt ?? null);
      // Snapshot the freshly-loaded values directly rather than relying on
      // the state set above — those updates haven't committed yet at this
      // point in the callback, so reading them back here would be stale.
      markClean({
        vendorId: b.vendorId ?? "",
        billDate: b.billDate ? b.billDate.slice(0, 10) : "",
        dueDate: b.dueDate ? b.dueDate.slice(0, 10) : "",
        category: b.category ?? "",
        notes: b.notes ?? "",
        discount: String(b.discount ?? 0),
        items: lineItems,
        attachmentUrl: b.attachmentUrl ?? null,
        attachmentName: b.attachmentName ?? null,
      });
      setLoading(false);
    }).catch(() => { setLoadErr("Failed to load bill."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markClean is stable-enough for this one-time load
  }, [id]);

  function discardIfUnsaved(url: string | null) {
    // Only ever discard a blob that isn't the bill's saved attachment — that
    // one is cleaned up by the PUT route itself once the change is committed.
    if (url && url !== originalAttachmentUrl.current) {
      fetch("/api/purchase-bills/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).catch(() => {});
    }
  }

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
        discardIfUnsaved(attachmentUrl);
        setAttachmentUrl(data.url);
        setAttachmentName(data.name);
        toast({ type: "success", title: "File uploaded", message: `${truncateFilename(data.name)} uploaded successfully.` });
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
    discardIfUnsaved(attachmentUrl);
    setAttachmentUrl(null);
    setAttachmentName(null);
  }

  const { grossTotal, itemDiscountTotal, taxTotal } = computePurchaseBillTotals(items, "0");
  const subtotal = grossTotal - itemDiscountTotal;
  const rawTotal = subtotal + taxTotal - toNum(discount);
  const { roundOff, roundedTotal: computedTotal } = computeRoundOff(rawTotal);
  const outstanding   = bill ? computedTotal - bill.paidAmount : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Belt-and-suspenders: the Save button is disabled while clean, but a
    // disabled button doesn't stop Enter-key form submission from an input.
    if (!isDirty) { toast({ type: "error", title: "Nothing to save", message: "No changes have been made yet." }); return; }
    if (attachmentUploading) { toast({ type: "error", title: "Check form", message: "Please wait for the attachment to finish uploading." }); return; }
    if (!vendorId) { toast({ type: "error", title: "Check form", message: "Please select a vendor." }); return; }
    if (!billDate) { toast({ type: "error", title: "Check form", message: "Bill date is required." }); return; }
    if (items.length === 0)                      { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (items.some(i => !i.name.trim()))          { toast({ type: "error", title: "Check form", message: "All items must have a name." }); return; }
    if (items.some(i => toNum(i.quantity) <= 0))  { toast({ type: "error", title: "Check form", message: "All quantities must be greater than 0." }); return; }
    if (items.some(i => !i.purchasePrice.trim() || toNum(i.purchasePrice) <= 0)) { toast({ type: "error", title: "Check form", message: "All item prices must be greater than 0." }); return; }
    if (dueDate && dueDate < billDate) { toast({ type: "error", title: "Check form", message: "Due date cannot be before the bill date." }); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        vendorId,
        billDate,
        dueDate:  dueDate || null,
        category: category || null,
        notes:    notes.trim() || null,
        discount: toNum(discount),
        attachmentUrl,
        attachmentName,
        expectedUpdatedAt: loadedUpdatedAt,
        items: items.map(i => {
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
        }),
      };
      const res = await fetch(`/api/purchase-bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCache("/api/purchase-bills");
        bustCache(`/api/purchase-bills/${id}`);
        bustCache("/api/products");
        invalidateCachedPdf("purchase-bill", id);
        toast({ type: "success", title: "Bill updated", message: "Changes saved successfully." });
        router.push(`/purchases/bills/${id}`);
      } else if (res.status === 409) {
        bustCache(`/api/purchase-bills/${id}`);
        toast({ type: "error", title: "Update conflict", message: data.error ?? "This bill was changed by someone else. Please reload and try again." });
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to update bill." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  if (loading) return (
    <>
      <OverlayLoader text="Loading bill…" />
      <div className={`page-stack ${styles.pageStack}`}>
        <Sk w={160} h={13} />
        <Sk w={200} h={20} />
        <div className="form-card">
          <div className="form-grid-2">
            <div className={styles.skFieldStack}><Sk w={70} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={70} h={12} /><Sk h={38} r={8} /></div>
          </div>
          <div className="form-grid-2">
            <div className={styles.skFieldStack}><Sk w={70} h={12} /><Sk h={38} r={8} /></div>
            <div className={styles.skFieldStack}><Sk w={70} h={12} /><Sk h={38} r={8} /></div>
          </div>
        </div>
        <div className="form-card">
          <Sk w={100} h={14} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skItemRow}>
              <Sk h={36} r={8} />
              <Sk h={36} r={8} />
              <Sk h={36} r={8} />
              <Sk h={36} r={8} />
              <Sk w={28} h={28} r={6} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
  if (loadErr)  return <div className={`error-banner ${styles.loadErr}`}>{loadErr}</div>;

  // Fully paid/cancelled bills have nothing left to edit — reachable directly
  // by URL even though the detail page's Edit button is disabled for these,
  // so guard here too rather than showing a form that has nowhere useful to go.
  if (bill && (bill.status === "paid" || bill.status === "cancelled")) {
    return (
      <div className={`page-stack ${styles.pageStack}`}>
        <Breadcrumb items={[
          { label: "Purchase Bills", href: "/purchases/bills" },
          { label: bill.billNumber, href: `/purchases/bills/${id}` },
          { label: "Edit" },
        ]} />
        <div className={`error-banner ${styles.loadErr}`}>
          This bill is {bill.status} and cannot be edited.
        </div>
        <div className="form-actions">
          <Button variant="secondary" href={`/purchases/bills/${id}`}>← Back to Bill</Button>
        </div>
      </div>
    );
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className={`page-stack ${styles.pageStack}`}>
      <Breadcrumb items={[
        { label: "Purchase Bills", href: "/purchases/bills" },
        { label: bill?.billNumber ?? "Bill", href: `/purchases/bills/${id}` },
        { label: "Edit" },
      ]} />

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Edit Bill — {bill?.billNumber}</h1>
          <p className="page-sub">{bill?.vendor.name}{bill?.vendor.company ? ` · ${bill.vendor.company}` : ""}</p>
        </div>
        {bill && <StatusBadge status={bill.status} />}
      </div>

      {/* Summary stats */}
      {bill && (
        <div {...animateSection(0, styles.statGrid)}>
          <StatCard label="Paid"        value={`₹${fmtCurrency(bill.paidAmount)}`} />
          <StatCard label="Outstanding" value={`₹${fmtCurrency(outstanding)}`} sub={outstanding <= 0 ? "Cleared" : undefined} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-stack">

        <BillDetailsCard
          sectionIndex={1}
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
          attachmentUrl={attachmentUrl}
          onAttachmentFileChange={handleAttachmentChange}
          onAttachmentRemove={removeAttachment}
        />

        <PurchaseBillItemsTable
          sectionIndex={2}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
        />

        <PurchaseBillTotals
          sectionIndex={3}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
          roundOff={roundOff}
          grandTotal={computedTotal}
          discount={discount}
          onDiscountChange={setDiscount}
        />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving || !isDirty} title={!isDirty ? "No changes to save" : undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            Save Changes
          </Button>
          <Button variant="secondary" href={`/purchases/bills/${id}`}>Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
