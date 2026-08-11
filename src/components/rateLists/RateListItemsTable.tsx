"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/components/ui/Input";
import { animateSection } from "@/lib/animateSection";
import {
  makeRateListLineItemKey, toNum, fmtCurrency, calcRateListItem,
  type RateListLineItem,
} from "@/lib/rateListForm";
import styles from "./RateListItemsTable.module.css";

interface RateListItemsTableProps {
  sectionIndex: number;
  items: RateListLineItem[];
  setItems: Dispatch<SetStateAction<RateListLineItem[]>>;
  itemsError?: string;
}

function emptyItem(): RateListLineItem {
  return { key: makeRateListLineItemKey(), name: "", brand: "", unit: "Nos", isNetRate: false, discountPercent: "0", listRate: "" };
}

// Editable rows for a Rate List — free-text (not linked to the Product
// catalog, unlike invoice/purchase-bill line items) since a rate list's
// brand/unit text (e.g. "QUALIGENS", "500 GM") often won't match this app's
// own Brand/Product records.
export function RateListItemsTable({ sectionIndex, items, setItems, itemsError }: RateListItemsTableProps) {
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});

  function addRow() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, field: keyof RateListLineItem, value: string | boolean) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

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
    <div {...animateSection(sectionIndex, "form-card")}>
      <h2 className="form-section-title">Items</h2>
      {itemsError && <p className={styles.itemsErrorMsg} role="alert">{itemsError}</p>}

      {items.length > 0 ? (
        <div className={styles.itemsTableWrap}>
          <table className={styles.itemsTable}>
            <colgroup>
              <col className={styles.colIndex} />
              <col className={styles.colName} />
              <col className={styles.colBrand} />
              <col className={styles.colUnit} />
              <col className={styles.colDiscount} />
              <col className={styles.colRate} />
              <col className={styles.colAmount} />
              <col className={styles.colAction} />
            </colgroup>
            <thead>
              <tr>
                {["#", "Item", "Brand", "Unit", "Discount", "List Rate (₹)", "Amount (₹)", ""].map((h) => (
                  <th key={h} className={h === "List Rate (₹)" || h === "Amount (₹)" ? styles.thRight : ["Unit", "Discount"].includes(h) ? styles.thCenter : styles.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { amount } = calcRateListItem(item);
                return (
                  <tr key={item.key} className={styles.itemRow}>
                    <td className={styles.tdIndex}>{idx + 1}</td>
                    <td className={styles.tdName}>
                      <Input sz="sm" value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="e.g. Sodium Nitrate" />
                    </td>
                    <td className={styles.tdBrand}>
                      <Input sz="sm" value={item.brand} onChange={(e) => updateItem(idx, "brand", e.target.value)} placeholder="e.g. QUALIGENS" />
                    </td>
                    <td className={styles.tdUnit}>
                      {/* Plain input, not UnitCombo — this table sits inside
                          .itemsTableWrap's overflow-x:auto, which clips an
                          absolutely-positioned dropdown before it can render
                          below the fold. UnitCombo is still correct for the
                          invoice/purchase-bill quick-add modals, which aren't
                          inside a scrolling container. */}
                      <Input sz="sm" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="e.g. 500 GM" className={styles.numInputCenter} />
                    </td>
                    <td className={styles.tdDiscount}>
                      <div className={styles.discountStack}>
                        {item.isNetRate ? (
                          <span className={styles.netRateBadge}>Net Rate</span>
                        ) : (
                          <Input
                            sz="sm" type="text" inputMode="decimal"
                            value={discountDrafts[item.key] ?? (toNum(item.discountPercent) > 0 ? Math.round(toNum(item.discountPercent) * 100) / 100 : "")}
                            onChange={(e) => handleDiscountPercentChange(idx, item.key, e.target.value)}
                            onBlur={() => clearDiscountDraft(item.key)}
                            placeholder="0%"
                            className={styles.numInputCenter}
                          />
                        )}
                        <label className={styles.netRateToggle}>
                          <input
                            type="checkbox"
                            checked={item.isNetRate}
                            onChange={(e) => updateItem(idx, "isNetRate", e.target.checked)}
                          />
                          Net rate
                        </label>
                      </div>
                    </td>
                    <td className={styles.tdRate}>
                      <Input sz="sm" type="text" inputMode="decimal" value={item.listRate} onChange={(e) => updateItem(idx, "listRate", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={styles.numInputRight} />
                    </td>
                    <td className={styles.tdAmount}>₹{fmtCurrency(amount)}</td>
                    <td className={styles.tdAction}>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeItemBtn}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.emptyItems}>No items yet. Add your first row below.</div>
      )}

      <button type="button" className={styles.addRowBtn} onClick={addRow}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Add Row
      </button>
    </div>
  );
}
