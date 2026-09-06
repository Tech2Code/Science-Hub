"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowIcon } from "@/components/ui/ArrowIcon";
import { Input } from "@/components/ui/Input";
import { RequiredStar } from "@/components/ui/RequiredStar";
import { QuickAddProductModal, type QuickAddOutcome } from "@/components/products/QuickAddProductModal";
import { useDropUp } from "@/lib/useDropUp";
import { animateSection } from "@/lib/animateSection";
import {
  PURCHASE_BILL_UNITS,
  makePurchaseBillLineItemKey, toNum, fmtCurrency, calcPurchaseBillItem,
  computeQuickAddNetRate, resolvePurchaseBillLineRate, resolveQuickAddLineRate,
  type PurchaseBillLineItem, type PurchaseBillProduct,
} from "@/lib/purchaseBillForm";
import styles from "./PurchaseBillItemsTable.module.css";

interface PurchaseBillItemsTableProps {
  sectionIndex: number;
  products: PurchaseBillProduct[];
  setProducts: Dispatch<SetStateAction<PurchaseBillProduct[]>>;
  items: PurchaseBillLineItem[];
  setItems: Dispatch<SetStateAction<PurchaseBillLineItem[]>>;
  /** Aggregate item-level validation message (e.g. missing quantity/price), shown inline instead of via toast. */
  itemsError?: string;
}

// Search-and-add product flow shared by New/Edit Purchase Bill pages. "Add custom item" can save to the catalog or, via "just for this bill", add a one-off non-stock line (e.g. freight).
export function PurchaseBillItemsTable({ sectionIndex, products, setProducts, items, setItems, itemsError }: PurchaseBillItemsTableProps) {
  const productSearchWrapRef = useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const { dropUp, measure } = useDropUp(showProductDropdown);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddInitialName, setQuickAddInitialName] = useState("");

  // Memoized — see the identical note in InvoiceLineItemsCard.tsx.
  const filteredProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())),
    [products, productSearch]
  );

  function addProduct(p: PurchaseBillProduct, quantity = "1") {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, quantity: String(toNum(item.quantity) + toNum(quantity)) } : item));
      }
      const { rate, discountPercent } = resolvePurchaseBillLineRate(p);
      return [...prev, {
        key: makePurchaseBillLineItemKey(), productId: p.id, name: p.name, hsn: p.hsn ?? "", unit: p.unit,
        quantity, purchasePrice: rate != null ? String(rate) : "", gstRate: String(p.gstRate), discountPercent,
      }];
    });
    setProductSearch(""); setShowProductDropdown(false);
  }

  function openQuickAddProduct(name = productSearch) {
    setQuickAddInitialName(name);
    setShowQuickAddProduct(true);
    setShowProductDropdown(false);
  }

  // The quick-add modal always resolves Purchase Price to List Price × Discount % (no manual
  // override field), so this always takes the "carry the discount forward" branch — kept via the
  // shared helper so the item's own Discount % column still reflects it, same as
  // resolvePurchaseBillLineRate above.
  function handleQuickAddOutcome(outcome: QuickAddOutcome) {
    const { rate: rateValue, discountPercent } = resolveQuickAddLineRate(
      outcome.listPrice, outcome.discountPercent, String(outcome.purchasePriceNum)
    );
    if (outcome.skipCatalog) {
      setItems((prev) => [...prev, {
        key: makePurchaseBillLineItemKey(), productId: "", name: outcome.name, hsn: outcome.hsn,
        unit: outcome.unit, quantity: outcome.quantity, purchasePrice: rateValue, gstRate: outcome.gstRate, discountPercent,
      }]);
      return;
    }
    const d = outcome.product;
    setProducts((prev) => [...prev, d]);
    setItems((prev) => [...prev, {
      key: makePurchaseBillLineItemKey(), productId: d.id, name: d.name, hsn: d.hsn ?? "", unit: d.unit,
      quantity: outcome.quantity, purchasePrice: rateValue, gstRate: outcome.gstRate, discountPercent,
    }]);
  }

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof PurchaseBillLineItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Press-and-hold reordering, off until "Reorder Items" is clicked; the row under the pointer is looked up via data-item-key since a numeric index goes stale on reorder.
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

  // Holds exactly what's been typed per line item so a trailing "." or "%" isn't stripped mid-keystroke; cleared on blur.
  // Same reject-outright pattern as the percent fields below, capped at 3 decimals instead of clamped to a max.
  function handleQuantityChange(idx: number, raw: string) {
    const cleaned = raw.replace(/[^\d.]/g, "");
    if (!/^\d*(\.\d{0,3})?$/.test(cleaned)) return;
    updateItem(idx, "quantity", cleaned);
  }

  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});

  // Accepts a trailing "%"; capped at 2 decimals and 100 overall — an out-of-range keystroke is rejected outright, not truncated later.
  function handleDiscountPercentChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/%/g, "");
    if (!/^(100(\.\d{0,2})?|\d{0,2}(\.\d{0,2})?)$/.test(cleaned)) return;
    setDiscountDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    updateItem(idx, "discountPercent", String(clamped));
  }

  function clearDiscountDraft(key: string) {
    setDiscountDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Same reject-outright-then-clamp pattern as handleDiscountPercentChange — GST rate is also a percentage, capped at 100.
  const [gstRateDrafts, setGstRateDrafts] = useState<Record<string, string>>({});

  function handleGstRateChange(idx: number, key: string, raw: string) {
    const cleaned = raw.replace(/%/g, "");
    if (!/^(100(\.\d{0,2})?|\d{0,2}(\.\d{0,2})?)$/.test(cleaned)) return;
    setGstRateDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseFloat(cleaned);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    updateItem(idx, "gstRate", String(clamped));
  }

  function clearGstRateDraft(key: string) {
    setGstRateDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  return (
    <>
    <div {...animateSection(sectionIndex, "form-card")}>
      <h2 className="form-section-title">Line Items</h2>
      {itemsError && <p className={styles.itemsErrorMsg} role="alert">{itemsError}</p>}

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
                    {p.unit} · ₹{p.purchasePrice ?? p.price} · GST {p.gstRate}%
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
          entityLabel="bill"
          defaultUnit="Pcs"
          baseUnits={PURCHASE_BILL_UNITS}
          initialName={quickAddInitialName}
        />
      )}

      {items.length > 0 ? (
        <>
        {items.length > 1 && (
          <div className={styles.reorderToggleRow}>
            <Button type="button" size="sm" variant="primary" onClick={() => setReorderMode((v) => !v)}>
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
            <colgroup>
              <col className={styles.colIndex} />
              <col className={styles.colName} />
              <col className={styles.colHsn} />
              <col className={styles.colUnit} />
              <col className={styles.colQty} />
              <col className={styles.colListPrice} />
              <col className={styles.colDiscount} />
              <col className={styles.colRate} />
              <col className={styles.colGst} />
              <col className={styles.colGstAmt} />
              <col className={styles.colAmount} />
              <col className={styles.colAction} />
            </colgroup>
            <thead>
              <tr>
                {["#", "Item", "HSN/SAC", "Unit", "Qty", "List Price (₹)", "Discount %", "Rate (₹)", "GST %", "GST Amt", "Amount", ""].map((h) => (
                  <th
                    key={h}
                    className={
                      h === "List Price (₹)" || h === "Rate (₹)" || h === "GST Amt" || h === "Amount" ? styles.thRight
                        : ["HSN/SAC", "Unit", "Qty", "Discount %", "GST %"].includes(h) ? styles.thCenter
                        : styles.th
                    }
                  >
                    {h}
                    {["Item", "Unit", "Qty", "List Price (₹)", "GST %"].includes(h) && <RequiredStar />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { total, gstAmount } = calcPurchaseBillItem(item);
                return (
                  <tr
                    key={item.key}
                    data-item-key={item.key}
                    className={`${styles.itemRow} ${reorderMode && draggedKey === item.key ? styles.draggingRow : ""}`}
                  >
                    <td className={styles.tdIndex}>{idx + 1}</td>
                    <td className={styles.tdName}>
                      <div className={styles.tdNameInner} title={item.name}>{item.name}</div>
                    </td>
                    <td className={styles.tdHsn}>
                      <Input sz="sm" aria-label={`HSN/SAC for ${item.name}`} value={item.hsn} maxLength={8} onChange={(e) => updateItem(idx, "hsn", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="HSN/SAC" />
                    </td>
                    <td className={styles.tdUnit}>
                      <Input sz="sm" aria-label={`Unit for ${item.name}`} value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="Unit" className={styles.numInputCenter} />
                    </td>
                    <td className={styles.tdQty}>
                      <Input sz="sm" aria-label={`Quantity for ${item.name}`} type="number" min="1" step="1" value={item.quantity} onChange={(e) => handleQuantityChange(idx, e.target.value)} className={styles.numInputCenter} />
                    </td>
                    <td className={styles.tdListPrice}>
                      <Input sz="sm" aria-label={`List price for ${item.name}`} type="text" inputMode="decimal" value={item.purchasePrice} onChange={(e) => updateItem(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                    </td>
                    <td className={styles.tdDiscount}>
                      <div className={styles.discountStack}>
                        <Input
                          sz="sm" type="text" inputMode="decimal"
                          aria-label={`Discount percent for ${item.name}`}
                          value={
                            discountDrafts[item.key] ??
                            (toNum(item.discountPercent) > 0 ? Math.round(toNum(item.discountPercent) * 100) / 100 : "")
                          }
                          onChange={(e) => handleDiscountPercentChange(idx, item.key, e.target.value)}
                          onBlur={() => clearDiscountDraft(item.key)}
                          placeholder="0%"
                          className={styles.numInputCenter}
                        />
                        {(() => {
                          const { discountAmount } = calcPurchaseBillItem(item);
                          return discountAmount > 0 ? (
                            <span className={styles.discountAmountHint}>₹{discountAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className={styles.tdRate}>
                      ₹{fmtCurrency(computeQuickAddNetRate(item.purchasePrice, item.discountPercent))}
                    </td>
                    <td className={styles.tdGst}>
                      <Input
                        sz="sm" type="text" inputMode="decimal"
                        aria-label={`GST rate for ${item.name}`}
                        value={gstRateDrafts[item.key] ?? item.gstRate}
                        onChange={(e) => handleGstRateChange(idx, item.key, e.target.value)}
                        onBlur={() => clearGstRateDraft(item.key)}
                        placeholder="18"
                        className={styles.numInputCenter}
                      />
                    </td>
                    <td className={styles.tdGstAmt}>₹{fmtCurrency(gstAmount)}</td>
                    <td className={styles.tdAmount}>₹{fmtCurrency(total)}</td>
                    <td className={styles.tdAction}>
                      <div className={styles.actionCellStack}>
                        {reorderMode && (
                          <button
                            type="button"
                            aria-label="Drag to reorder"
                            className={styles.gripBtn}
                            onPointerDown={(e) => handleGripPointerDown(e, item.key)}
                          >
                            ⠿
                          </button>
                        )}
                        <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeItemBtn}>
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
