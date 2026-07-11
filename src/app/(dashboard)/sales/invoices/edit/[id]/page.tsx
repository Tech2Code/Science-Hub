"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Sk } from "@/components/ui/Skeleton";
import { fetchCached, bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { INDIA_STATES } from "@/lib/states";
import { animateSection } from "@/lib/animateSection";
import styles from "./edit.module.css";


interface Product {
  id: string; name: string; unit: string; price: number; gstRate: number; stock: number; hsn?: string | null;
}

interface LineItem {
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
  hsn: string; discountPercent: number;
}

interface InvoiceData {
  id: string; invoiceNumber: string; status: string; date: string;
  isInterState: boolean; placeOfSupply?: string; reverseCharge?: boolean; dueDate?: string; notes?: string;
  customer: { id: string; name: string; city: string; state: string; gstin: string; };
  items: Array<{ productId: string; name: string; unit: string; quantity: number; price: number; gstRate: number; hsn?: string; discountPercent?: number; }>;
}

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

// A custom typed amount rarely lands on a preset % exactly — inject it into
// the option list (rounded to 2dp) so the select actually shows/highlights
// it instead of falling back to blank.
function discountOptionsFor(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  if (DISCOUNT_OPTIONS.includes(rounded)) return DISCOUNT_OPTIONS;
  return [...DISCOUNT_OPTIONS, rounded].sort((a, b) => a - b);
}

export default function EditInvoicePage() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isInterState, setIsInterState] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [businessState, setBusinessState] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [initialState, setInitialState] = useState<{ isInterState: boolean; placeOfSupply: string; reverseCharge: boolean; items: LineItem[]; notes: string; dueDate: string } | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
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
      setItems(lineItems);
      setInitialState({ isInterState: inter, placeOfSupply: pos, reverseCharge: rc, items: lineItems, notes: notesVal, dueDate: dueDateVal });
      setLoading(false);
    }).catch(() => { setError("Failed to load invoice."); setLoading(false); });
  }, [id]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addProduct = useCallback((p: Product) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prev, { productId: p.id, productName: p.name, unit: p.unit, qty: 1, price: p.price, gstRate: p.gstRate, hsn: p.hsn ?? "", discountPercent: 0 }];
    });
    setProductSearch("");
    setShowProductDropdown(false);
  }, []);

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Typing a flat ₹ amount is just another way to set discountPercent — it's
  // converted against that line's gross (qty × rate) so the stored value stays
  // a percentage, same as picking one from the dropdown.
  function setDiscountAmount(idx: number, amountStr: string) {
    const amount = parseFloat(amountStr) || 0;
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = item.qty * item.price;
      const discountPercent = gross > 0 ? Math.min(100, Math.max(0, (amount / gross) * 100)) : 0;
      return { ...item, discountPercent };
    }));
  }

  // Discount is applied to the line's gross amount (qty × rate) before GST —
  // taxable value = gross - discount, and GST is computed on that taxable value.
  const lineBreakdown = (item: LineItem) => {
    const gross = item.qty * item.price;
    const discountAmount = (gross * item.discountPercent) / 100;
    const taxable = gross - discountAmount;
    const gstAmt = (taxable * item.gstRate) / 100;
    return { gross, discountAmount, taxable, gstAmt, total: taxable + gstAmt };
  };

  const grossTotal = items.reduce((sum, item) => sum + lineBreakdown(item).gross, 0);
  const discountTotal = items.reduce((sum, item) => sum + lineBreakdown(item).discountAmount, 0);
  const subtotal = items.reduce((sum, item) => sum + lineBreakdown(item).taxable, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const { gstAmt } = lineBreakdown(item);
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + gstAmt;
    return acc;
  }, {} as Record<number, number>);
  const totalTax = Object.values(taxBreakdown).reduce((a, b) => a + b, 0);
  const grandTotal = subtotal + totalTax;

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
      }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      bustCache(`/api/invoices/${id}`);
      bustCache("/api/products");
      toast({ type: "success", title: "Invoice updated", message: "Changes saved." });
      if (d.stockWarnings?.length > 0) {
        toast({ type: "warning", title: "Stock went negative", message: d.stockWarnings.join(", ") });
      }
      router.push(`/sales/invoices/${id}`);
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
        { label: invoice.invoiceNumber, href: `/invoices/${id}` },
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
                <div className={styles.billToName}>{invoice.customer.name}</div>
                <div className={styles.billToMeta}>
                  {[invoice.customer.city, invoice.customer.state].filter(Boolean).join(", ")}
                  {invoice.customer.gstin && ` · GSTIN: ${invoice.customer.gstin}`}
                </div>
              </div>
            </div>

            {/* Place of supply + inter-state + due date */}
            <div {...animateSection(1, `card ${styles.sectionCard}`)}>
              <div className={styles.optionsRow}>
                <div className={styles.dueDateGroup}>
                  <label className={styles.dueDateLabel}>Place of supply *</label>
                  <select
                    value={placeOfSupply}
                    onChange={(e) => {
                      const state = e.target.value;
                      setPlaceOfSupply(state);
                      if (state && businessState) setIsInterState(state !== businessState);
                    }}
                    className={styles.dueDateInput}
                  >
                    <option value="">Select state…</option>
                    {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label className={styles.switchLabel}>
                  <div
                    role="switch"
                    aria-checked={isInterState}
                    onClick={() => setIsInterState((v) => !v)}
                    className={`${styles.switchTrack} ${isInterState ? styles.switchTrackOn : ""}`}
                  >
                    <span className={`${styles.switchThumb} ${isInterState ? styles.switchThumbOn : ""}`} />
                  </div>
                  <span className={styles.switchText}>Inter-state supply (IGST)</span>
                </label>
                <label className={styles.switchLabel}>
                  <div
                    role="switch"
                    aria-checked={reverseCharge}
                    onClick={() => setReverseCharge((v) => !v)}
                    className={`${styles.switchTrack} ${reverseCharge ? styles.switchTrackOn : ""}`}
                  >
                    <span className={`${styles.switchThumb} ${reverseCharge ? styles.switchThumbOn : ""}`} />
                  </div>
                  <span className={styles.switchText}>Reverse charge applicable</span>
                </label>
                <div className={styles.dueDateGroup}>
                  <label className={styles.dueDateLabel}>Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    min={invoiceDate || undefined}
                    onChange={(e) => setDueDate(e.target.value)}
                    onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
                    className={styles.dueDateInput}
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div {...animateSection(2, `card ${styles.sectionCard}`)}>
              <h2 className={styles.sectionTitle}>Line Items</h2>
              <div className={styles.productSearchWrap}>
                <input
                  type="text"
                  placeholder="Search and add product…"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  className={styles.productSearchInput}
                />
                {showProductDropdown && productSearch && filteredProducts.length > 0 && (
                  <div className={styles.productDropdown}>
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id} type="button" onClick={() => addProduct(p)}
                        className={styles.productOption}
                      >
                        <div className={styles.productOptionName}>{p.name}</div>
                        <div className={styles.productOptionMeta}>{p.unit} · ₹{p.price} · GST {p.gstRate}% · Stock: {p.stock}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 ? (
                <div className={styles.tableScroll}>
                  <table className={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th className={styles.itemsTh}>Product</th>
                        <th className={styles.itemsThCenter}>HSN/SAC</th>
                        <th className={styles.itemsTh}>Unit</th>
                        <th className={styles.itemsThRight}>Qty</th>
                        <th className={styles.itemsThRight}>List Price (₹)</th>
                        <th className={styles.itemsThCenter}>Discount</th>
                        <th className={styles.itemsThRight}>GST%</th>
                        <th className={styles.itemsThRight}>Total (₹)</th>
                        <th className={styles.itemsTh} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const { discountAmount, total: lineTotal } = lineBreakdown(item);
                        return (
                        <tr key={idx}>
                          <td className={styles.itemsTdName} title={item.productName}>{item.productName}</td>
                          <td className={styles.itemsTdCenter}>
                            <input type="text" value={item.hsn}
                              onChange={(e) => updateItem(idx, "hsn", e.target.value)}
                              placeholder="HSN/SAC"
                              className={styles.hsnInput}
                            />
                          </td>
                          <td className={styles.itemsTdUnit}>{item.unit}</td>
                          <td className={styles.itemsTdNum}>
                            <input type="number" min="1" value={item.qty}
                              onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 1)}
                              className={styles.qtyInput}
                            />
                          </td>
                          <td className={styles.itemsTdNum}>
                            <input type="text" inputMode="decimal" value={item.price}
                              onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                              className={styles.priceInput}
                            />
                          </td>
                          <td className={styles.discountCell}>
                            <div className={styles.discountStack}>
                              <select
                                value={Math.round(item.discountPercent * 100) / 100}
                                onChange={(e) => updateItem(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                                className={styles.discountSelect}
                              >
                                {discountOptionsFor(item.discountPercent).map((d) => <option key={d} value={d}>{d}%</option>)}
                              </select>
                              <input
                                type="text" inputMode="decimal"
                                value={discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""}
                                onChange={(e) => setDiscountAmount(idx, e.target.value)}
                                placeholder="₹0"
                                title="Flat discount amount"
                                className={styles.discountAmountInput}
                              />
                            </div>
                          </td>
                          <td className={styles.itemsTdRight}>{item.gstRate}%</td>
                          <td className={styles.itemsTdAmount}>₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={styles.itemsTd}>
                            <button type="button" onClick={() => removeItem(idx)} aria-label="Remove"
                              className={styles.removeBtn}
                            >×</button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyItems}>
                  Search for a product above to add items
                </div>
              )}
            </div>

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
              {(() => {
                const hasChanges = initialState === null || (
                  isInterState !== initialState.isInterState ||
                  placeOfSupply !== initialState.placeOfSupply ||
                  reverseCharge !== initialState.reverseCharge ||
                  notes !== initialState.notes ||
                  dueDate !== initialState.dueDate ||
                  JSON.stringify(items) !== JSON.stringify(initialState.items)
                );
                return (
                  <div className="summary-actions">
                    <Button
                      type="submit"
                      variant="primary"
                      size="full"
                      disabled={saving || items.length === 0 || !placeOfSupply || !hasChanges}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>Update Invoice
                    </Button>
                    {!hasChanges && items.length > 0 && !saving && (
                      <p className={styles.noChangesHint}>No changes detected.</p>
                    )}
                    <Button variant="secondary" href={`/sales/invoices/${id}`} size="full">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </form>
    </div>
    </>
  );
}
