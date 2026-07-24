"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Sk } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { invalidateCachedPdf } from "@/lib/pdfCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { useDirty } from "@/lib/useDirty";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InvoiceOptionsRow } from "@/components/invoices/InvoiceOptionsRow";
import { InvoiceLineItemsCard } from "@/components/invoices/InvoiceLineItemsCard";
import { computeInvoiceTotals, makeInvoiceLineItemKey, type InvoiceLineItem, type InvoiceProduct } from "@/lib/invoiceCalc";
import { animateSection } from "@/lib/animateSection";
import styles from "./edit.module.css";

type Product = InvoiceProduct;
type LineItem = InvoiceLineItem;

interface InvoiceData {
  id: string; invoiceNumber: string; status: string; date: string; updatedAt?: string;
  isInterState: boolean; placeOfSupply?: string; reverseCharge?: boolean; dueDate?: string; notes?: string;
  customer: { id: string; name: string; city: string; state: string; gstin: string; };
  items: Array<{ productId: string; name: string; unit: string; quantity: number; price: number; gstRate: number; hsn?: string; discountPercent?: number; }>;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.role === "manager") router.replace("/dashboard");
  }, [session, router]);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const { isDirty, markClean } = useDirty({ isInterState, placeOfSupply, reverseCharge, items, notes, dueDate });
  const [invoiceDate, setInvoiceDate] = useState("");
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockOutItems, setStockOutItems] = useState<{ name: string; available: number; requested: number }[]>([]);

  useEffect(() => {
    Promise.all([
      fetchCached(`/api/invoices/${id}`),
      fetchCached("/api/products").catch(() => []),
      fetchCached("/api/settings").catch(() => null),
    ]).then(([inv, prods, settings]) => {
      const invoice = inv as InvoiceData;
      const products = prods as Product[];
      setInvoice(invoice);
      setProducts(products);
      setBusinessState((settings as { state?: string } | null)?.state ?? "");
      const inter = invoice.isInterState ?? false;
      const pos = invoice.placeOfSupply ?? invoice.customer.state ?? "";
      const notesVal = invoice.notes ?? "";
      const dueDateVal = invoice.dueDate ? invoice.dueDate.split("T")[0] : "";
      const lineItems: LineItem[] = invoice.items.map((item: InvoiceData["items"][0]) => ({
        key: makeInvoiceLineItemKey(),
        productId: item.productId,
        productName: item.name,
        unit: item.unit,
        qty: item.quantity,
        price: item.price,
        gstRate: item.gstRate,
        hsn: item.hsn ?? "",
        discountPercent: item.discountPercent ?? 0,
      }));
      const rc = invoice.reverseCharge ?? false;
      setIsInterState(inter);
      setPlaceOfSupply(pos);
      setReverseCharge(rc);
      setNotes(notesVal);
      setDueDate(dueDateVal);
      setInvoiceDate(invoice.date ? invoice.date.split("T")[0] : "");
      setLoadedUpdatedAt(invoice.updatedAt ?? null);
      setItems(lineItems);
      markClean({ isInterState: inter, placeOfSupply: pos, reverseCharge: rc, items: lineItems, notes: notesVal, dueDate: dueDateVal });
      setLoading(false);
    }).catch(() => { setError("Failed to load invoice."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markClean is a fresh function each render (not memoized); only `id` should retrigger this fetch
  }, [id]);

  const { grossTotal, discountTotal, taxBreakdown, roundOff, grandTotal } = computeInvoiceTotals(items);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) { toast({ type: "error", title: "Check form", message: "Add at least one item." }); return; }
    if (!placeOfSupply) { toast({ type: "error", title: "Check form", message: "Select place of supply." }); return; }
    if (dueDate && invoiceDate && dueDate < invoiceDate) { toast({ type: "error", title: "Check form", message: "Due date cannot be before the invoice date." }); return; }
    for (const item of items) {
      const qtyErr   = validate(String(item.qty),   rules.positiveNumber("Item quantity must be greater than 0."));
      const priceErr = validate(String(item.price), rules.nonNegativeNumber("Item price cannot be negative."));
      if (qtyErr || priceErr) { toast({ type: "error", title: "Check form", message: qtyErr ?? priceErr ?? "" }); return; }
    }

    // Check stock: current product.stock already has this invoice's old qty deducted,
    // so effective available = product.stock + original qty for that product.
    const outOfStock = items.flatMap(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return [];
      const originalQty = invoice?.items.find(orig => orig.productId === item.productId)?.quantity ?? 0;
      const effectiveStock = product.stock + originalQty;
      if (item.qty > effectiveStock) {
        return [{ name: item.productName, available: effectiveStock, requested: item.qty }];
      }
      return [];
    });
    if (outOfStock.length > 0) {
      setStockOutItems(outOfStock);
      setShowStockDialog(true);
      return;
    }
    await doSubmit();
  }

  async function doSubmit() {
    setShowStockDialog(false);
    setSaving(true);
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isInterState,
        placeOfSupply,
        reverseCharge,
        items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, gstRate: i.gstRate, unit: i.unit, hsn: i.hsn, discountPercent: i.discountPercent })),
        notes,
        dueDate: dueDate || undefined,
        expectedUpdatedAt: loadedUpdatedAt,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      bustCache(`/api/invoices/${id}`);
      bustCache("/api/products");
      invalidateCachedPdf("invoice", id);
      toast({ type: "success", title: "Invoice updated", message: "Changes saved." });
      if (d.stockWarnings?.length > 0) {
        toast({ type: "warning", title: "Stock went negative", message: d.stockWarnings.join(", ") });
      }
      router.push(`/sales/invoices/${id}`);
    }
    else if (res.status === 409) {
      const d = await res.json().catch(() => ({}));
      bustCache(`/api/invoices/${id}`);
      toast({ type: "error", title: "Update conflict", message: d?.error ?? "This invoice was changed by someone else. Please reload and try again." });
    }
    else { const d = await res.json().catch(() => ({})); toast({ type: "error", title: "Failed", message: d?.error ?? "Failed to update invoice." }); }
  }

  if (loading) return (
    <div className="page-stack">
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <Sk w={220} h={14} />
      <div className={`card ${styles.skCard}`}>
        <Sk w={160} h={13} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.skItemRow}>
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk h={36} r={8} />
            <Sk w={28} h={28} r={6} />
          </div>
        ))}
        <Sk w={120} h={32} r={8} />
      </div>
      <div className={styles.skGrid}>
        <div className={`card ${styles.skSummaryCard}`}>
          <Sk w={100} h={13} />
          <Sk h={80} r={8} />
        </div>
        <div className={`card ${styles.skSummaryCard}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skSummaryRow}>
              <Sk w="40%" h={13} />
              <Sk w="30%" h={13} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (error && !invoice) return <div className={`loading-center ${styles.errorCenter}`}>{error}</div>;
  if (!invoice) return null;

  return (
    <>
    {saving && <OverlayLoader text="Saving invoice…" />}

    <ConfirmDialog
      open={showStockDialog}
      title="Items out of stock"
      message="The following items don't have enough stock. Do you still want to update the invoice?"
      detail={
        <div className={styles.stockDialog}>
          <div className={styles.stockDialogHeader}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className={styles.stockDialogHeaderText}>Insufficient stock</span>
          </div>
          <div className={styles.stockDialogBody}>
            {stockOutItems.map((item, i) => (
              <div key={i} className={`${styles.stockDialogRow} ${i % 2 === 0 ? styles.stockDialogRowAlt : ""}`}>
                <span className={styles.stockDialogRowName}>{item.name}</span>
                <span className={styles.stockDialogRowMeta}>
                  Have <strong>{item.available}</strong> · Need <strong>{item.requested}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      confirmLabel="Update Anyway"
      cancelLabel="Go Back"
      variant="danger"
      loading={saving}
      onConfirm={doSubmit}
      onCancel={() => setShowStockDialog(false)}
    />

    <div className="page-stack">
      <Breadcrumb items={[
        { label: "Invoices", href: "/sales/invoices" },
        { label: invoice.invoiceNumber, href: `/sales/invoices/${id}` },
        { label: "Edit" },
      ]} />
      <div>
        <h1 className="page-title">Edit Invoice — {invoice.invoiceNumber}</h1>
        <p className="page-sub">Editing is allowed only while the invoice is unpaid or partially paid.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className={styles.layout}>
          {/* Left column */}
          <div className={styles.leftCol}>
            {/* Customer (read-only) */}
            <div {...animateSection(0, `card ${styles.sectionCard}`)}>
              <h2 className={styles.sectionTitle}>Bill To</h2>
              <div className={styles.billToBox}>
                <div className={styles.billToName} title={invoice.customer.name}>{invoice.customer.name}</div>
                <div className={styles.billToMeta}>
                  {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                  {invoice.customer.gstin && ` · GSTIN: ${invoice.customer.gstin}`}
                </div>
              </div>
            </div>

            {/* Place of supply + inter-state + due date */}
            <InvoiceOptionsRow
              sectionIndex={1}
              placeOfSupply={placeOfSupply}
              onPlaceOfSupplyChange={(state) => {
                setPlaceOfSupply(state);
                if (state && businessState) setIsInterState(state !== businessState);
              }}
              isInterState={isInterState}
              onToggleInterState={() => setIsInterState((v) => !v)}
              reverseCharge={reverseCharge}
              onToggleReverseCharge={() => setReverseCharge((v) => !v)}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              minDueDate={invoiceDate || undefined}
            />

            {/* Items */}
            <InvoiceLineItemsCard
              sectionIndex={2}
              products={products}
              setProducts={setProducts}
              items={items}
              setItems={setItems}
            />

            {/* Notes */}
            <div {...animateSection(3, `card ${styles.sectionCard}`)}>
              <label className={styles.notesLabel}>Notes / Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, delivery instructions…"
                className={styles.notesInput}
              />
            </div>
          </div>

          {/* Right — summary */}
          <div className={styles.rightCol}>
            <div {...animateSection(4, `card ${styles.summaryCard}`)}>
              <h2 className={styles.summaryTitle}>Invoice Summary</h2>
              <div className={styles.summaryList}>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>₹{grossTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {discountTotal > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Discount</span>
                    <span className={styles.discountValue}>−₹{discountTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {Object.entries(taxBreakdown).map(([rate, amt]) =>
                  isInterState ? (
                    <div key={rate} className={styles.summaryRow}>
                      <span>IGST {rate}%</span>
                      <span>₹{amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <div key={rate} className={styles.summaryGstGroup}>
                      <div className={styles.summaryRow}>
                        <span>CGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className={styles.summaryRow}>
                        <span>SGST {Number(rate) / 2}%</span>
                        <span>₹{(amt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )
                )}
                {roundOff !== 0 && (
                  <div className={styles.summaryRow}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? "+" : "−"}₹{Math.abs(roundOff).toFixed(2)}</span>
                  </div>
                )}
                <div className={styles.summaryTotalRow}>
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
              {items.length === 0 && (
                <p className={styles.summaryHint}>• Add at least one item</p>
              )}
              {!placeOfSupply && items.length > 0 && (
                <p className={styles.summaryHint}>• Select place of supply</p>
              )}
              <div className="summary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="full"
                  disabled={saving || items.length === 0 || !placeOfSupply || !isDirty}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Invoice
                </Button>
                {!isDirty && items.length > 0 && !saving && (
                  <p className={styles.noChangesHint}>No changes detected.</p>
                )}
                <Button variant="secondary" href={`/sales/invoices/${id}`} size="full">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
    </>
  );
}
