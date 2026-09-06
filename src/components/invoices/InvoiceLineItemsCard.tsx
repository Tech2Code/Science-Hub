"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { Input } from "@/components/ui/Input";
import { RequiredStar } from "@/components/ui/RequiredStar";
import { QuickAddProductModal, type QuickAddOutcome } from "@/components/products/QuickAddProductModal";
import { animateSection } from "@/lib/animateSection";
import { useDropUp } from "@/lib/useDropUp";
import { lineBreakdown, makeInvoiceLineItemKey, type InvoiceLineItem, type InvoiceProduct } from "@/lib/invoiceCalc";
import styles from "./InvoiceLineItemsCard.module.css";

const QUICK_ADD_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pkt", "Set", "Mtr", "Dozen"];

interface InvoiceLineItemsCardProps {
  sectionIndex: number;
  products: InvoiceProduct[];
  setProducts: Dispatch<SetStateAction<InvoiceProduct[]>>;
  items: InvoiceLineItem[];
  setItems: Dispatch<SetStateAction<InvoiceLineItem[]>>;
}

// Product search + line-items table, shared by New/Edit Invoice pages so the two forms can't drift apart.
export function InvoiceLineItemsCard({ sectionIndex, products, setProducts, items, setItems }: InvoiceLineItemsCardProps) {
  const productSearchWrapRef = useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const { dropUp, measure } = useDropUp(showProductDropdown);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddInitialName, setQuickAddInitialName] = useState("");

  // Memoized so typing in an unrelated line-item cell (qty/price/discount) — which re-renders this
  // whole component since items/setItems are lifted to the parent — doesn't re-scan the full product
  // catalog on every keystroke; only an actual products/productSearch change re-runs the filter.
  const filteredProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())),
    [products, productSearch]
  );

  function addProduct(p: InvoiceProduct, qty = 1) {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, qty: item.qty + qty } : item));
      }
      // Selling Price still equalling Purchase Price means it was never deliberately set away from
      // cost (no stored flag distinguishing "defaulted" from "priced at cost on purpose" — see
      // ProductFormFields.tsx) — in that case prefill List Price/Discount % (the vendor's own
      // terms) instead of the flat Selling Price, same as the quick-add modal, so "List Price (₹)"
      // shows the product's real List Price and "Rate (₹)" auto-computes the net. Once Selling
      // Price is genuinely set apart from cost, it's trusted as the deliberate customer-facing rate.
      const looksDefaulted = p.purchasePrice != null && Math.abs(p.price - p.purchasePrice) < 0.01;
      const useListPrice = looksDefaulted && p.listPrice != null;
      const price = useListPrice ? p.listPrice! : p.price;
      const discountPercent = useListPrice ? (p.discountPercent ?? 0) : 0;
      return [...prev, { key: makeInvoiceLineItemKey(), productId: p.id, productName: p.name, unit: p.unit, qty, price, gstRate: p.gstRate, hsn: p.hsn ?? "", discountPercent }];
    });
    setProductSearch(""); setShowProductDropdown(false);
  }

  function openQuickAddProduct(name = productSearch) {
    setQuickAddInitialName(name);
    setShowQuickAddProduct(true);
    setShowProductDropdown(false);
  }

  // A custom "just for this invoice" item has no product record to carry a Selling Price on, so its
  // line is priced straight off the popup's List Price/Discount % (there's no other rate to use).
  // But a newly-created CATALOG product goes through the same divergence-aware pricing as picking
  // an existing product (addProduct() above) — the popup lets the user type a Selling Price
  // distinct from the vendor's List Price/Discount terms, and that must reach this invoice's line,
  // not just sit unused on the new product's own catalog record.
  function handleQuickAddOutcome(outcome: QuickAddOutcome) {
    if (outcome.skipCatalog) {
      const listPriceNum = parseFloat(outcome.listPrice) || 0;
      const discountPercentNum = Math.min(100, Math.max(0, parseFloat(outcome.discountPercent) || 0));
      setItems((prev) => [...prev, {
        key: makeInvoiceLineItemKey(), productId: "", productName: outcome.name,
        unit: outcome.unit, qty: outcome.qty, price: listPriceNum,
        gstRate: parseFloat(outcome.gstRate) || 0, hsn: outcome.hsn, discountPercent: discountPercentNum,
      }]);
      return;
    }
    const d = outcome.product;
    setProducts((prev) => [...prev, d]);
    addProduct(d, outcome.qty);
  }

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  // Reordering is off by default, only enabled via the explicit "Reorder Items" toggle.
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  function handleGripPointerDown(e: React.PointerEvent<HTMLButtonElement>, key: string) {
    e.preventDefault();
    setDraggedKey(key);
  }

  useEffect(() => {
    if (!draggedKey) return;

    function rowKeyAt(clientX: number, clientY: number) {
      const el = document.elementFromPoint(clientX, clientY);
      return el?.closest<HTMLTableRowElement>("[data-item-key]")?.dataset.itemKey ?? null;
    }

    function onMove(e: PointerEvent) {
      const overKey = rowKeyAt(e.clientX, e.clientY);
      if (!overKey || overKey === draggedKey) return;
      setItems((prev) => {
        const fromIdx = prev.findIndex((i) => i.key === draggedKey);
        const toIdx = prev.findIndex((i) => i.key === overKey);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    }

    function onUp() {
      setDraggedKey(null);
    }

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [draggedKey, setItems]);
  function updateItem(idx: number, field: keyof InvoiceLineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Holds exactly what's been typed per line item so a trailing "." or "%" isn't stripped mid-keystroke; cleared on blur.
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});

  // Accepts a trailing "%"; capped at 2 decimals and 100 overall — an out-of-range keystroke is rejected outright, not truncated later.
  function handleDiscountPercentChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/%/g, "");
    if (!/^(100(\.\d{0,2})?|\d{0,2}(\.\d{0,2})?)$/.test(cleaned)) return;
    setDiscountDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    updateItem(idx, "discountPercent", clamped);
  }

  function clearDiscountDraft(key: string) {
    setDiscountDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Same reject-outright-then-clamp pattern as handleDiscountPercentChange — GST rate is also a
  // percentage, capped at 100 (mirrors PurchaseBillItemsTable's own handleGstRateChange exactly).
  const [gstRateDrafts, setGstRateDrafts] = useState<Record<string, string>>({});

  function handleGstRateChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/%/g, "");
    if (!/^(100(\.\d{0,2})?|\d{0,2}(\.\d{0,2})?)$/.test(cleaned)) return;
    setGstRateDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    updateItem(idx, "gstRate", clamped);
  }

  function clearGstRateDraft(key: string) {
    setGstRateDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Price/Qty are stored as numbers on the item itself (unlike Purchase Bill's string-typed line
  // items), so a naive `value={item.price}` + `parseFloat` on every keystroke re-renders the input
  // back to the parsed number immediately — typing "125.50" collapses to "125" the instant "." is
  // typed (parseFloat("125.") === 125), silently corrupting the next keystroke into "1255". Same
  // draft-buffer pattern as discountDrafts above: hold the raw typed string until blur, only commit
  // the parsed number to item state (which the actual GST/total math reads) alongside it.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  function handlePriceChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    if ((cleaned.match(/\./g) ?? []).length > 1) return;
    setPriceDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    updateItem(idx, "price", isNaN(parsed) ? 0 : parsed);
  }

  function clearPriceDraft(key: string) {
    setPriceDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Capped at 3 decimals — an out-of-range keystroke is rejected outright, not truncated later.
  function handleQtyChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    if (!/^\d*(\.\d{0,3})?$/.test(cleaned)) return;
    setQtyDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    updateItem(idx, "qty", isNaN(parsed) || parsed <= 0 ? 1 : parsed);
  }

  function clearQtyDraft(key: string) {
    setQtyDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const section = animateSection(sectionIndex, `card ${styles.cardPad}`);

  return (
    <>
    <div
      className={section.className}
      style={{ ...section.style, position: "relative", zIndex: showProductDropdown ? 5 : "auto" }}
    >
      <h2 className={styles.lineItemsHeading}>Line Items</h2>
      <div className={styles.searchRow}>
        <div className={styles.productSearchWrap} ref={productSearchWrapRef}>
          <Input
            type="text"
            placeholder="Search and add product…"
            value={productSearch}
            onChange={(e) => { setProductSearch(e.target.value); measure(productSearchWrapRef.current); setShowProductDropdown(true); }}
            onFocus={() => { measure(productSearchWrapRef.current); setShowProductDropdown(true); }}
            onClick={() => { measure(productSearchWrapRef.current); setShowProductDropdown(true); }}
            onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
            onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
          />
          {showProductDropdown && (
          <div className={`${styles.dropdown} ${dropUp ? styles.dropdownUp : ""}`} onMouseDown={(e) => e.preventDefault()}>
            {filteredProducts.length > 0 ? filteredProducts.map((p) => (
              <button key={p.id} type="button" onClick={() => addProduct(p)} className={styles.dropdownBtn}>
                <div className={styles.dropdownItemName} title={p.name}>{p.name}</div>
                <div className={styles.dropdownItemMeta}>
                  {p.unit} · ₹{p.price} · GST {p.gstRate}% · Stock: {p.stock}
                </div>
              </button>
            )) : (
              <div className={styles.dropdownEmpty}>
                No product found.{" "}
                <button type="button" className={styles.dropdownEmptyLink} onMouseDown={(e) => e.preventDefault()} onClick={() => openQuickAddProduct()}>
                  Add new product <ArrowIcon />
                </button>
              </div>
            )}
          </div>
          )}
        </div>
        {!showProductDropdown && (
          <button
            type="button"
            onClick={() => { setProductSearch(""); openQuickAddProduct(""); }}
            className={styles.customItemBtn}
          >
            + Add custom item manually
          </button>
        )}
      </div>

      {showQuickAddProduct && (
        <QuickAddProductModal
          onClose={() => setShowQuickAddProduct(false)}
          onAdd={handleQuickAddOutcome}
          entityLabel="invoice"
          defaultUnit="Nos"
          baseUnits={QUICK_ADD_UNITS}
          initialName={quickAddInitialName}
        />
      )}

      {items.length > 0 ? (
        <>
        {items.length > 1 && (
          <div className={styles.reorderToggleRow}>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => setReorderMode((v) => !v)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 7l4-4 4 4" />
                <path d="M8 17l4 4 4-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
              {reorderMode ? "Done Reordering" : "Reorder Items"}
            </Button>
          </div>
        )}
        <div className={styles.itemsTableWrap}>
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>Item<RequiredStar /></th>
                <th className={styles.thCenter}>HSN/SAC</th>
                <th className={styles.thCenter}>Unit<RequiredStar /></th>
                <th className={styles.thCenter}>Qty<RequiredStar /></th>
                <th className={styles.thCenter}>List Price (₹)<RequiredStar /></th>
                <th className={styles.thCenter}>Discount %</th>
                <th className={styles.thRight}>Rate (₹)</th>
                <th className={styles.thCenter}>GST %<RequiredStar /></th>
                <th className={styles.thRight}>GST Amt</th>
                <th className={styles.thRight}>Total (₹)</th>
                <th className={styles.thAction} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { discountAmount, gstAmt: lineGst, total: lineTotal } = lineBreakdown(item);
                return (
                  <tr
                    key={item.key}
                    data-item-key={item.key}
                    className={[
                      idx % 2 === 0 ? styles.itemRow : styles.itemRowAlt,
                      reorderMode && draggedKey === item.key ? styles.draggingRow : "",
                    ].join(" ")}
                  >
                    <td className={styles.tdIndex}>{idx + 1}</td>
                    <td className={styles.tdProduct}>
                      <div className={styles.tdProductInner} title={item.productName}>{item.productName}</div>
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        sz="sm" type="text" value={item.hsn} maxLength={8}
                        onChange={(e) => updateItem(idx, "hsn", e.target.value.replace(/\D/g, "").slice(0, 8))}
                        aria-label={`HSN/SAC for ${item.productName}`}
                        placeholder="HSN/SAC"
                        className={styles.hsnInput}
                      />
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        sz="sm" type="text" value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        aria-label={`Unit for ${item.productName}`}
                        placeholder="Unit"
                        className={styles.unitInput}
                      />
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        sz="sm" type="number" min="1" step="1"
                        value={qtyDrafts[item.key] ?? String(item.qty)}
                        onChange={(e) => handleQtyChange(idx, item.key, e.target.value)}
                        onBlur={() => clearQtyDraft(item.key)}
                        aria-label={`Quantity for ${item.productName}`}
                        className={styles.qtyInput}
                      />
                    </td>
                    <td className={styles.tdRight}>
                      <Input
                        sz="sm" type="text" inputMode="decimal"
                        value={priceDrafts[item.key] ?? String(item.price)}
                        onChange={(e) => handlePriceChange(idx, item.key, e.target.value)}
                        onBlur={() => clearPriceDraft(item.key)}
                        aria-label={`List price for ${item.productName}`}
                        className={styles.priceInput}
                      />
                    </td>
                    <td className={styles.discountCell}>
                      <div className={styles.discountStack}>
                        <Input
                          sz="sm" type="text" inputMode="decimal"
                          value={
                            discountDrafts[item.key] ??
                            (item.discountPercent > 0 ? Math.round(item.discountPercent * 100) / 100 : "")
                          }
                          onChange={(e) => handleDiscountPercentChange(idx, item.key, e.target.value)}
                          onBlur={() => clearDiscountDraft(item.key)}
                          aria-label={`Discount percent for ${item.productName}`}
                          placeholder="0%"
                          className={styles.discountPercentInput}
                        />
                        {discountAmount > 0 && (
                          <span className={styles.discountAmountHint}>
                            ₹{discountAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.tdRate}>
                      <div className={styles.rateStack}>
                        ₹{(item.price * (1 - item.discountPercent / 100)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {(() => {
                          const product = products.find((p) => p.id === item.productId);
                          // Compare against this cell's own net rate (post-discount), not the raw
                          // List Price column — a line prefilled from List Price/Discount % is usually
                          // gross-higher than purchasePrice even when its net rate is at/below cost.
                          const netRate = item.price * (1 - item.discountPercent / 100);
                          const atOrBelowCost = product?.purchasePrice != null && product.purchasePrice > 0 && netRate <= product.purchasePrice;
                          return atOrBelowCost ? <span className={styles.costWarningHint}>⚠ At/below cost</span> : null;
                        })()}
                      </div>
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        sz="sm" type="text" inputMode="decimal"
                        value={gstRateDrafts[item.key] ?? item.gstRate}
                        onChange={(e) => handleGstRateChange(idx, item.key, e.target.value)}
                        onBlur={() => clearGstRateDraft(item.key)}
                        aria-label={`GST rate for ${item.productName}`}
                        placeholder="18"
                        className={styles.gstInput}
                      />
                    </td>
                    <td className={styles.tdGstAmt}>
                      ₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={styles.tdTotal}>
                      ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={styles.tdActionCell}>
                      <div className={styles.actionCellStack}>
                        {reorderMode && (
                          <button
                            type="button"
                            aria-label="Drag to reorder"
                            className={`${styles.gripBtn} ${draggedKey === item.key ? styles.gripBtnActive : ""}`}
                            onPointerDown={(e) => handleGripPointerDown(e, item.key)}
                          >
                            ⠿
                          </button>
                        )}
                        <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeBtn}>
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className={styles.emptyItems}>
          Search for a product above to add items
        </div>
      )}
    </div>
    </>
  );
}
