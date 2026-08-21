"use client";

import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Input, Select, FormField } from "@/components/ui/Input";
import { UnitCombo } from "@/components/ui/UnitCombo";
import { RequiredStar } from "@/components/ui/RequiredStar";
import { useToast } from "@/components/ui/Toast";
import { bustCachePrefix } from "@/lib/useCache";
import { rules, validate } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useDropUp } from "@/lib/useDropUp";
import {
  PURCHASE_BILL_UNITS, PURCHASE_BILL_GST_RATES,
  makePurchaseBillLineItemKey, toNum, fmtCurrency, calcPurchaseBillItem,
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

type QuickAddErrors = Partial<Record<"name" | "purchasePrice" | "unit" | "gstRate", string>>;

// Search-and-add product flow shared by New/Edit Purchase Bill pages. "Add custom item" can save to the catalog or, via "just for this bill", add a one-off non-stock line (e.g. freight).
export function PurchaseBillItemsTable({ sectionIndex, products, setProducts, items, setItems, itemsError }: PurchaseBillItemsTableProps) {
  const toast = useToast();
  const productSearchWrapRef = useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const { dropUp, measure } = useDropUp(showProductDropdown);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddProduct, setQuickAddProduct] = useState({ name: "", unit: "", purchasePrice: "", salePrice: "", gstRate: "18", hsn: "", skipCatalog: false });
  const [quickAddErrors, setQuickAddErrors] = useState<QuickAddErrors>({});
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const unitFieldId = useId();

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  function addProduct(p: PurchaseBillProduct) {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, quantity: String(toNum(item.quantity) + 1) } : item));
      }
      const rate = p.purchasePrice ?? p.price;
      return [...prev, {
        key: makePurchaseBillLineItemKey(), productId: p.id, name: p.name, hsn: p.hsn ?? "", unit: p.unit,
        quantity: "1", purchasePrice: rate != null ? String(rate) : "", gstRate: String(p.gstRate), discountPercent: "0",
      }];
    });
    setProductSearch(""); setShowProductDropdown(false);
  }

  function openQuickAddProduct(name = productSearch) {
    setQuickAddProduct({ name, unit: "", purchasePrice: "", salePrice: "", gstRate: "18", hsn: "", skipCatalog: false });
    setQuickAddErrors({});
    setShowQuickAddProduct(true);
    setShowProductDropdown(false);
  }

  async function handleQuickAddProduct() {
    const errs: QuickAddErrors = {
      name: validate(quickAddProduct.name, rules.required("Item name is required."), rules.minLength(2), rules.maxLength(200)) ?? undefined,
      purchasePrice: validate(quickAddProduct.purchasePrice, rules.required("Price is required."), rules.nonNegativeNumber()) ?? undefined,
      unit: validate(quickAddProduct.unit, rules.required("Unit is required.")) ?? undefined,
      gstRate: validate(quickAddProduct.gstRate, rules.required("GST rate is required."), rules.nonNegativeNumber()) ?? undefined,
    };
    if (Object.values(errs).some(Boolean)) { setQuickAddErrors(errs); return; }
    setQuickAddErrors({});

    if (quickAddProduct.skipCatalog) {
      setItems((prev) => [...prev, {
        key: makePurchaseBillLineItemKey(), productId: "", name: quickAddProduct.name.trim(), hsn: quickAddProduct.hsn.trim(),
        unit: quickAddProduct.unit, quantity: "1", purchasePrice: quickAddProduct.purchasePrice, gstRate: quickAddProduct.gstRate, discountPercent: "0",
      }]);
      setShowQuickAddProduct(false);
      setShowProductDropdown(false);
      toast({ type: "success", title: "Item added", message: `"${quickAddProduct.name.trim()}" added to this bill only.` });
      return;
    }

    setQuickAddSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickAddProduct.name.trim(),
          unit: quickAddProduct.unit.trim() || "Pcs",
          price: quickAddProduct.salePrice.trim() || quickAddProduct.purchasePrice,
          purchasePrice: quickAddProduct.purchasePrice,
          gstRate: quickAddProduct.gstRate,
          hsn: quickAddProduct.hsn.trim() || undefined,
          stock: 0,
        }),
      });
      const d = await res.json().catch(() => ({}));
      setQuickAddSaving(false);
      if (!res.ok) { toast({ type: "error", title: "Failed", message: d?.error ?? "Could not add product." }); return; }
      bustCachePrefix("/api/products");
      setProducts((prev) => [...prev, d]);
      addProduct(d);
      setShowQuickAddProduct(false);
      setShowProductDropdown(false);
      toast({ type: "success", title: "Product added", message: `"${d.name}" was created and added to this bill.` });
    } catch {
      setQuickAddSaving(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
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

  return (
    <>
    {quickAddSaving && <OverlayLoader text="Adding…" />}
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
                    Add new product →
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

      <Modal
        open={showQuickAddProduct}
        onClose={() => { if (!quickAddSaving) setShowQuickAddProduct(false); }}
        title="Add Custom Item"
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" size="md" onClick={() => setShowQuickAddProduct(false)} disabled={quickAddSaving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="md" onClick={handleQuickAddProduct} disabled={quickAddSaving}>
              {quickAddSaving ? "Adding…" : quickAddProduct.skipCatalog ? "Add to bill" : "Save & use product"}
            </Button>
          </>
        }
      >
        <div className={styles.customForm}>
          <FormField label="Item Name" required error={quickAddErrors.name}>
            <Input
              type="text" placeholder="e.g. Beaker 250ml Borosilicate"
              autoFocus
              value={quickAddProduct.name}
              onChange={(e) => { setQuickAddProduct((p) => ({ ...p, name: e.target.value })); setQuickAddErrors((p) => ({ ...p, name: undefined })); }}
              maxLength={200}
            />
          </FormField>
          <div className={styles.grid4}>
            <FormField label="Unit" required error={quickAddErrors.unit} id={unitFieldId}>
              <UnitCombo
                id={unitFieldId}
                value={quickAddProduct.unit}
                onChange={(v) => { setQuickAddProduct((p) => ({ ...p, unit: v })); setQuickAddErrors((p) => ({ ...p, unit: undefined })); }}
                suggestions={PURCHASE_BILL_UNITS}
              />
            </FormField>
            <FormField label="Purchase Price (₹)" required error={quickAddErrors.purchasePrice}>
              <Input
                type="text" inputMode="decimal" placeholder="0.00"
                value={quickAddProduct.purchasePrice}
                onChange={(e) => { setQuickAddProduct((p) => ({ ...p, purchasePrice: e.target.value })); setQuickAddErrors((p) => ({ ...p, purchasePrice: undefined })); }}
              />
            </FormField>
            {!quickAddProduct.skipCatalog && (
              <FormField label="Sale Price (₹)" hint="Defaults to purchase price if left blank">
                <Input
                  type="text" inputMode="decimal" placeholder="0.00"
                  value={quickAddProduct.salePrice}
                  onChange={(e) => setQuickAddProduct((p) => ({ ...p, salePrice: e.target.value }))}
                />
              </FormField>
            )}
            <FormField label="GST %" required error={quickAddErrors.gstRate}>
              <Input
                type="text" inputMode="decimal" placeholder="18"
                value={quickAddProduct.gstRate}
                onChange={(e) => { setQuickAddProduct((p) => ({ ...p, gstRate: e.target.value })); setQuickAddErrors((p) => ({ ...p, gstRate: undefined })); }}
              />
            </FormField>
            <FormField label="HSN/SAC" hint="Optional">
              <Input
                type="text" placeholder="e.g. 3822" maxLength={8}
                value={quickAddProduct.hsn}
                onChange={(e) => setQuickAddProduct((p) => ({ ...p, hsn: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
              />
            </FormField>
          </div>
          <label className={styles.skipCatalogLabel}>
            <input
              type="checkbox"
              checked={quickAddProduct.skipCatalog}
              onChange={(e) => setQuickAddProduct((p) => ({ ...p, skipCatalog: e.target.checked }))}
              className={styles.skipCatalogCheckbox}
            />
            Just for this bill — don&apos;t save to catalog
          </label>
        </div>
      </Modal>

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
              <col className={styles.colRate} />
              <col className={styles.colDiscount} />
              <col className={styles.colGst} />
              <col className={styles.colAmount} />
              <col className={styles.colAction} />
            </colgroup>
            <thead>
              <tr>
                {["#", "Item", "HSN/SAC", "Unit", "Qty", "Rate (₹)", "Discount %", "GST %", "Amount", ""].map((h) => (
                  <th
                    key={h}
                    className={
                      h === "Rate (₹)" || h === "Amount" ? styles.thRight
                        : ["HSN/SAC", "Unit", "Qty", "Discount %", "GST %"].includes(h) ? styles.thCenter
                        : styles.th
                    }
                  >
                    {h}
                    {["Item", "Qty", "Rate (₹)"].includes(h) && <RequiredStar />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { total } = calcPurchaseBillItem(item);
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
                      <Input sz="sm" value={item.hsn} maxLength={8} onChange={(e) => updateItem(idx, "hsn", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="HSN/SAC" />
                    </td>
                    <td className={styles.tdUnit}>
                      <span className={styles.unitBadge}>{item.unit}</span>
                    </td>
                    <td className={styles.tdQty}>
                      <Input sz="sm" type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className={styles.numInputCenter} />
                    </td>
                    <td className={styles.tdRate}>
                      <Input sz="sm" type="text" inputMode="decimal" value={item.purchasePrice} onChange={(e) => updateItem(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                    </td>
                    <td className={styles.tdDiscount}>
                      <div className={styles.discountStack}>
                        <Input
                          sz="sm" type="text" inputMode="decimal"
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
                    <td className={styles.tdGst}>
                      <Select sz="sm" value={item.gstRate} onChange={(e) => updateItem(idx, "gstRate", e.target.value)}>
                        {PURCHASE_BILL_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </Select>
                    </td>
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
