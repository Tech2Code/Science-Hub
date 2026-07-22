"use client";

import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { bustCache } from "@/lib/useCache";
import { animateSection } from "@/lib/animateSection";
import {
  PURCHASE_BILL_UNITS, PURCHASE_BILL_GST_RATES, PURCHASE_BILL_MARGIN_PRESETS,
  makeBlankPurchaseBillItem, discountOptionsFor, toNum, fmtCurrency, calcPurchaseBillItem,
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

// Line-items table (product select, name, unit, qty, rate, discount, GST,
// amount) plus the "unmatched items → save to catalog" flow — shared by the
// New Purchase Bill and Edit Purchase Bill pages so the two forms can't
// drift apart.
export function PurchaseBillItemsTable({ sectionIndex, products, setProducts, items, setItems }: PurchaseBillItemsTableProps) {
  const toast = useToast();

  // Catalog save state: set of item keys currently being saved
  const [catalogSaving, setCatalogSaving] = useState<Set<string>>(new Set());
  // Selling price entered per unmatched-item row before "Save to catalog" —
  // without this the product would be created with sale price == purchase
  // price (zero margin), since the purchase-bill form never asks for one.
  const [catalogSalePrice, setCatalogSalePrice] = useState<Record<string, string>>({});
  // Margin % preset per row — picking one derives the sale price from cost;
  // typing the sale price directly clears this back to "Custom".
  const [catalogMarginPct, setCatalogMarginPct] = useState<Record<string, string>>({});

  function addItem() { setItems((prev) => [...prev, makeBlankPurchaseBillItem()]); }
  function removeItem(idx: number) {
    const key = items[idx]?.key;
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (key) {
      setCatalogSalePrice((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setCatalogMarginPct((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setCatalogSaving((prev) => { if (!prev.has(key)) return prev; const s = new Set(prev); s.delete(key); return s; });
    }
  }

  const handleItemChange = useCallback((idx: number, field: keyof PurchaseBillLineItem, value: string) => {
    if (field === "name") {
      const current = items[idx];
      const match = products.find((p) => p.name.trim().toLowerCase() === value.trim().toLowerCase());
      // Typing a name that exactly matches an existing catalog product
      // auto-links it — whether this row started unlinked or was linked to
      // a *different* product (editing the name away from a picked product
      // and onto another catalog product's name should re-link, not stay
      // pinned to the old one).
      if (match && current?.productId !== match.id) {
        const rate = match.purchasePrice ?? match.price;
        setItems((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name: value,
            productId: match.id,
            unit: match.unit,
            purchasePrice: rate != null ? String(rate) : next[idx].purchasePrice,
            gstRate: String(match.gstRate),
          };
          return next;
        });
        toast({ type: "success", title: "Linked to catalog", message: `Matched existing product "${match.name}".` });
        return;
      }
      // Editing the name away from the currently-linked product (and it no
      // longer matches any other catalog product either) un-links this row
      // — otherwise it silently stays tied to the old product: no stock
      // update for the real item, and it never surfaces in "Save to
      // catalog" below since that list only looks at unlinked rows.
      if (!match && current?.productId) {
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], name: value, productId: "" };
          return next;
        });
        return;
      }
    }
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    // Rate changed after a margin % was already picked for this row's
    // "save to catalog" card — re-derive the sale price from the new cost
    // instead of leaving it stale from whatever the rate was before.
    const key = items[idx]?.key;
    if (field === "purchasePrice" && key && catalogMarginPct[key]) {
      const pct = catalogMarginPct[key];
      setCatalogSalePrice((prev) => ({ ...prev, [key]: (toNum(value) * (1 + toNum(pct) / 100)).toFixed(2) }));
    }
  }, [items, products, toast, catalogMarginPct, setItems]);

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

  const handleProductSelect = useCallback((idx: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    setItems((prev) => {
      const next = [...prev];
      if (product) {
        // Prefer the dedicated purchase price; most existing catalog items
        // won't have one set yet, so fall back to the sale price rather
        // than leaving the rate blank.
        const rate = product.purchasePrice ?? product.price;
        next[idx] = {
          ...next[idx],
          productId: product.id,
          name: product.name,
          unit: product.unit,
          purchasePrice: rate != null ? String(rate) : "",
          gstRate: String(product.gstRate),
        };
      } else {
        next[idx] = { ...next[idx], productId: "", name: "" };
      }
      return next;
    });
  }, [products, setItems]);

  function handleCatalogSalePriceChange(key: string, value: string) {
    setCatalogSalePrice((prev) => ({ ...prev, [key]: value }));
    setCatalogMarginPct((prev) => ({ ...prev, [key]: "" }));
  }

  function handleCatalogMarginChange(key: string, cost: string, pct: string) {
    setCatalogMarginPct((prev) => ({ ...prev, [key]: pct }));
    if (pct === "") return;
    setCatalogSalePrice((prev) => ({ ...prev, [key]: (toNum(cost) * (1 + toNum(pct) / 100)).toFixed(2) }));
  }

  async function handleAddToCatalog(idx: number) {
    const item = items[idx];
    if (!item.name.trim()) return;
    const salePrice = toNum(catalogSalePrice[item.key] ?? item.purchasePrice);
    setCatalogSaving((prev) => new Set(prev).add(item.key));
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          item.name.trim(),
          unit:          item.unit,
          price:         salePrice,
          purchasePrice: toNum(item.purchasePrice),
          gstRate:       toNum(item.gstRate),
          stock:    0,
          minStock: 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((prev) => [...prev, data]);
        setItems((prev) => {
          const next = [...prev];
          const i = next.findIndex((x) => x.key === item.key);
          if (i !== -1) next[i] = { ...next[i], productId: data.id };
          return next;
        });
        bustCache("/api/products");
        toast({ type: "success", title: "Saved to catalog", message: `${data.name} added as a product.` });
      } else {
        toast({ type: "error", title: "Failed", message: data.error ?? "Could not save to catalog." });
      }
    } catch {
      toast({ type: "error", title: "Error", message: "Network error — please try again." });
    }
    setCatalogSaving((prev) => { const s = new Set(prev); s.delete(item.key); return s; });
  }

  // Items not linked to any catalog product
  const unmatchedItems = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.productId === "" && item.name.trim() !== "");

  return (
    <div {...animateSection(sectionIndex, "form-card")}>
      <div className={styles.sectionHeaderRow}>
        <h2 className={`form-section-title ${styles.sectionTitleNoMargin}`}>Items</h2>
        <Button type="button" variant="secondary" size="sm" onClick={addItem}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Item
        </Button>
      </div>

      <div className={styles.itemsTableWrap}>
        <table className={styles.itemsTable}>
          <colgroup>
            <col className={styles.colProduct} />
            <col className={styles.colName} />
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
              {["Product (optional)", "Item Name", "Unit", "Qty", "Rate (₹)", "Discount", "GST %", "Amount", ""].map((h) => (
                <th key={h} className={h === "Amount" ? styles.thRight : styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const { discountAmount, total } = calcPurchaseBillItem(item);
              return (
                <tr key={item.key} className={styles.itemRow}>
                  <td className={styles.tdProduct}>
                    <Select sz="sm" value={item.productId} onChange={(e) => handleProductSelect(idx, e.target.value)}>
                      <option value="">— Select —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                    </Select>
                  </td>
                  <td className={styles.tdName}>
                    <Input sz="sm" value={item.name} onChange={(e) => handleItemChange(idx, "name", e.target.value)} placeholder="Item name" required />
                  </td>
                  <td className={styles.tdUnit}>
                    <Select sz="sm" value={item.unit} onChange={(e) => handleItemChange(idx, "unit", e.target.value)}>
                      {PURCHASE_BILL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </td>
                  <td className={styles.tdQty}>
                    <Input sz="sm" type="number" min="1" step="1" value={item.quantity} onChange={(e) => handleItemChange(idx, "quantity", e.target.value)} className={styles.numInputRight} />
                  </td>
                  <td className={styles.tdRate}>
                    <Input sz="sm" type="text" inputMode="decimal" value={item.purchasePrice} onChange={(e) => handleItemChange(idx, "purchasePrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                  </td>
                  <td className={styles.tdDiscount}>
                    <div className={styles.discountStack}>
                      <Select sz="sm" value={Math.round(toNum(item.discountPercent) * 100) / 100} onChange={(e) => handleItemChange(idx, "discountPercent", e.target.value)}>
                        {discountOptionsFor(toNum(item.discountPercent)).map((d) => <option key={d} value={d}>{d}%</option>)}
                      </Select>
                      <Input
                        sz="sm" type="text" inputMode="decimal"
                        value={discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""}
                        onChange={(e) => setItemDiscountAmount(idx, e.target.value)}
                        placeholder="₹0"
                        title="Flat discount amount"
                        className={styles.numInputRight}
                      />
                    </div>
                  </td>
                  <td className={styles.tdGst}>
                    <Select sz="sm" value={item.gstRate} onChange={(e) => handleItemChange(idx, "gstRate", e.target.value)}>
                      {PURCHASE_BILL_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </Select>
                  </td>
                  <td className={styles.tdAmount}>₹{fmtCurrency(total)}</td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length <= 1}
                      title="Remove item"
                      className={items.length <= 1 ? styles.removeItemBtnDisabled : styles.removeItemBtn}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Unmatched items — offer to save to product catalog ── */}
      {unmatchedItems.length > 0 && (
        <div className={styles.unmatchedWrap}>
          <div className={styles.unmatchedHeading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {unmatchedItems.length} item{unmatchedItems.length > 1 ? "s" : ""} not linked to your product catalog — save them?
          </div>
          <div className={styles.unmatchedList}>
            {unmatchedItems.map(({ item, idx }) => (
              <div key={item.key} className={styles.unmatchedRow}>
                <div className={styles.unmatchedInfo}>
                  <div className={styles.unmatchedName} title={item.name}>{item.name}</div>
                  <div className={styles.unmatchedMeta}>
                    {item.unit} · Purchased at ₹{fmtCurrency(toNum(item.purchasePrice))} · GST {item.gstRate}%
                  </div>
                </div>
                <div className={styles.unmatchedSaleField}>
                  <label className={styles.unmatchedSaleLabel} htmlFor={`margin-pct-${item.key}`}>Margin %</label>
                  <Select
                    id={`margin-pct-${item.key}`}
                    sz="sm"
                    value={catalogMarginPct[item.key] ?? ""}
                    onChange={(e) => handleCatalogMarginChange(item.key, item.purchasePrice, e.target.value)}
                  >
                    <option value="">Custom</option>
                    {PURCHASE_BILL_MARGIN_PRESETS.map((p) => <option key={p} value={p}>{p}%</option>)}
                  </Select>
                </div>
                <div className={styles.unmatchedSaleField}>
                  <label className={styles.unmatchedSaleLabel} htmlFor={`sale-price-${item.key}`}>Sale Price (₹)</label>
                  <Input
                    id={`sale-price-${item.key}`}
                    sz="sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={catalogSalePrice[item.key] ?? item.purchasePrice}
                    onChange={(e) => handleCatalogSalePriceChange(item.key, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <button
                  type="button"
                  disabled={catalogSaving.has(item.key)}
                  onClick={() => handleAddToCatalog(idx)}
                  className={catalogSaving.has(item.key) ? styles.saveToCatalogBtnSaving : styles.saveToCatalogBtn}
                >
                  {catalogSaving.has(item.key) ? (
                    <svg className={styles.spinIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  )}
                  Save to catalog
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
