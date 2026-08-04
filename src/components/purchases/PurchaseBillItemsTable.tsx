"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { Input, Select, FormField } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { bustCachePrefix } from "@/lib/useCache";
import { rules, validate } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { useDropUp } from "@/lib/useDropUp";
import {
  PURCHASE_BILL_UNITS, PURCHASE_BILL_GST_RATES,
  makePurchaseBillLineItemKey, discountOptionsFor, toNum, fmtCurrency, calcPurchaseBillItem,
  type PurchaseBillLineItem, type PurchaseBillProduct,
} from "@/lib/purchaseBillForm";
import styles from "./PurchaseBillItemsTable.module.css";

interface PurchaseBillItemsTableProps {
  sectionIndex: number;
  products: PurchaseBillProduct[];
  setProducts: Dispatch<SetStateAction<PurchaseBillProduct[]>>;
  items: PurchaseBillLineItem[];
  setItems: Dispatch<SetStateAction<PurchaseBillLineItem[]>>;
}

type QuickAddErrors = Partial<Record<"name" | "purchasePrice" | "unit" | "gstRate", string>>;

// Search-and-add product flow (same interaction as the sales invoice's line
// items card) — shared by the New Purchase Bill and Edit Purchase Bill pages
// so the two forms can't drift apart. "Add custom item" can either save the
// new item to the product catalog (default) or, via the "just for this bill"
// toggle, add it as a one-off line that never becomes a stocked product —
// for purchase lines like freight or services that aren't inventory.
export function PurchaseBillItemsTable({ sectionIndex, products, setProducts, items, setItems }: PurchaseBillItemsTableProps) {
  const toast = useToast();
  const productSearchWrapRef = useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const { dropUp, measure } = useDropUp(showProductDropdown);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddProduct, setQuickAddProduct] = useState({ name: "", unit: "Pcs", purchasePrice: "", salePrice: "", gstRate: "18", skipCatalog: false });
  const [quickAddErrors, setQuickAddErrors] = useState<QuickAddErrors>({});
  const [quickAddSaving, setQuickAddSaving] = useState(false);

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
    setQuickAddProduct({ name, unit: "Pcs", purchasePrice: "", salePrice: "", gstRate: "18", skipCatalog: false });
    setQuickAddErrors({});
    setShowQuickAddProduct(true);
    setShowProductDropdown(false);
  }

  async function handleQuickAddProduct() {
    const errs: QuickAddErrors = {
      name: validate(quickAddProduct.name, rules.required("Item name is required.")) ?? undefined,
      purchasePrice: validate(quickAddProduct.purchasePrice, rules.required("Price is required."), rules.nonNegativeNumber()) ?? undefined,
      unit: validate(quickAddProduct.unit, rules.required("Unit is required.")) ?? undefined,
      gstRate: validate(quickAddProduct.gstRate, rules.required("GST rate is required."), rules.nonNegativeNumber()) ?? undefined,
    };
    if (Object.values(errs).some(Boolean)) { setQuickAddErrors(errs); return; }
    setQuickAddErrors({});

    if (quickAddProduct.skipCatalog) {
      setItems((prev) => [...prev, {
        key: makePurchaseBillLineItemKey(), productId: "", name: quickAddProduct.name.trim(), hsn: "",
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

  // Typing a flat ₹ amount is just another way to set discountPercent — it's
  // converted against that line's gross (qty × rate) so the stored value
  // stays a percentage, same as the sales invoice form.
  function setItemDiscountAmount(idx: number, amountStr: string) {
    const amount = toNum(amountStr);
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = toNum(item.quantity) * toNum(item.purchasePrice);
      const discountPercent = gross > 0 ? Math.min(100, Math.max(0, (amount / gross) * 100)) : 0;
      return { ...item, discountPercent: String(discountPercent) };
    }));
  }

  return (
    <div {...animateSection(sectionIndex, "form-card")}>
      <h2 className="form-section-title">Items</h2>

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
        <button
          type="button"
          onClick={() => { setProductSearch(""); openQuickAddProduct(""); }}
          className={styles.customItemBtn}
        >
          + Add custom item
        </button>
      </div>

      <Modal open={showQuickAddProduct} onClose={() => { if (!quickAddSaving) setShowQuickAddProduct(false); }} title="Add Custom Item" maxWidth="34rem">
        <div className={styles.customForm}>
          <FormField label="Item Name" required error={quickAddErrors.name}>
            <Input
              type="text" placeholder="e.g. Beaker 250ml Borosilicate"
              autoFocus
              value={quickAddProduct.name}
              onChange={(e) => { setQuickAddProduct((p) => ({ ...p, name: e.target.value })); setQuickAddErrors((p) => ({ ...p, name: undefined })); }}
            />
          </FormField>
          <div className={styles.grid4}>
            <FormField label="Unit" required error={quickAddErrors.unit}>
              <Select
                value={quickAddProduct.unit}
                onChange={(e) => { setQuickAddProduct((p) => ({ ...p, unit: e.target.value })); setQuickAddErrors((p) => ({ ...p, unit: undefined })); }}
              >
                {PURCHASE_BILL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
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
          {!quickAddProduct.skipCatalog && (
            <p className={styles.customFormHint}>
              This product will be saved to your catalog and added to this bill.
            </p>
          )}
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" size="md" onClick={() => setShowQuickAddProduct(false)} disabled={quickAddSaving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="md" onClick={handleQuickAddProduct} disabled={quickAddSaving || !quickAddProduct.name.trim() || !quickAddProduct.purchasePrice.trim()}>
              {quickAddSaving ? "Adding…" : quickAddProduct.skipCatalog ? "Add to bill" : "Add & use product"}
            </Button>
          </div>
        </div>
      </Modal>

      {items.length > 0 ? (
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
                {["#", "Item", "HSN/SAC", "Unit", "Qty", "Rate (₹)", "Discount", "GST %", "Amount", ""].map((h) => (
                  <th key={h} className={h === "Amount" ? styles.thRight : styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { total } = calcPurchaseBillItem(item);
                return (
                  <tr key={item.key} className={styles.itemRow}>
                    <td className={styles.tdIndex}>{idx + 1}</td>
                    <td className={styles.tdName}>
                      <div className={styles.tdNameInner} title={item.name}>{item.name}</div>
                    </td>
                    <td className={styles.tdHsn}>
                      <Input sz="sm" value={item.hsn} onChange={(e) => updateItem(idx, "hsn", e.target.value)} placeholder="HSN/SAC" />
                    </td>
                    <td className={styles.tdUnit}>
                      <Select sz="sm" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)}>
                        {PURCHASE_BILL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </Select>
                    </td>
                    <td className={styles.tdQty}>
                      <Input sz="sm" type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className={styles.numInputRight} />
                    </td>
                    <td className={styles.tdRate}>
                      <Input sz="sm" type="text" inputMode="decimal" value={item.purchasePrice} onChange={(e) => updateItem(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                    </td>
                    <td className={styles.tdDiscount}>
                      <div className={styles.discountStack}>
                        <Select sz="sm" value={Math.round(toNum(item.discountPercent) * 100) / 100} onChange={(e) => updateItem(idx, "discountPercent", e.target.value)}>
                          {discountOptionsFor(toNum(item.discountPercent)).map((d) => <option key={d} value={d}>{d}%</option>)}
                        </Select>
                        <Input
                          sz="sm" type="text" inputMode="decimal"
                          value={(() => { const { discountAmount } = calcPurchaseBillItem(item); return discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""; })()}
                          onChange={(e) => setItemDiscountAmount(idx, e.target.value)}
                          placeholder="₹0"
                          title="Flat discount amount"
                          className={styles.numInputRight}
                        />
                      </div>
                    </td>
                    <td className={styles.tdGst}>
                      <Select sz="sm" value={item.gstRate} onChange={(e) => updateItem(idx, "gstRate", e.target.value)}>
                        {PURCHASE_BILL_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </Select>
                    </td>
                    <td className={styles.tdAmount}>₹{fmtCurrency(total)}</td>
                    <td className={styles.tdAction}>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeItemBtn}>
                        ×
                      </button>
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
  );
}
