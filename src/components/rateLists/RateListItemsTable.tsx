"use client";

import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { useToast } from "@/components/ui/Toast";
import { animateSection } from "@/lib/animateSection";
import {
  makeRateListLineItemKey, toNum, fmtCurrency, calcRateListItem,
  type RateListLineItem,
} from "@/lib/rateListForm";
import { parsePastedRateListText, type ParsedRateListRow } from "@/lib/rateListImport";
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

function toLineItems(rows: ParsedRateListRow[]): RateListLineItem[] {
  return rows.map((r) => ({ key: makeRateListLineItemKey(), ...r }));
}

// Editable rows for a Rate List — free-text (not linked to the Product
// catalog, unlike invoice/purchase-bill line items) since a rate list's
// brand/unit text (e.g. "QUALIGENS", "500 GM") often won't match this app's
// own Brand/Product records.
export function RateListItemsTable({ sectionIndex, items, setItems, itemsError }: RateListItemsTableProps) {
  const toast = useToast();
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Replaces the table's still-empty scaffold rows on a fresh form, otherwise
  // appends after whatever's already been filled in — so importing into a
  // brand-new list doesn't leave a stray blank row, but importing a second
  // batch into an already-started list doesn't wipe it out either.
  function mergeImportedItems(rows: ParsedRateListRow[], skipped: number) {
    const imported = toLineItems(rows);
    setItems((prev) => {
      const kept = prev.filter((i) => i.name.trim() || toNum(i.listRate) > 0);
      return [...kept, ...imported];
    });
    toast({
      type: "success", title: "Imported",
      message: `${rows.length} item${rows.length === 1 ? "" : "s"} added${skipped > 0 ? ` (${skipped} row${skipped === 1 ? "" : "s"} skipped — missing name or rate)` : ""}.`,
    });
  }

  function handlePasteImport() {
    const { items: rows, skipped } = parsePastedRateListText(pasteText);
    if (rows.length === 0) {
      toast({ type: "error", title: "Nothing to import", message: "Couldn't find any usable rows — each needs at least a name and a list rate." });
      return;
    }
    mergeImportedItems(rows, skipped);
    setPasteText("");
    setPasteModalOpen(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/rate-lists/parse-import", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ type: "error", title: "Import failed", message: data.error ?? "Could not read the file." });
        return;
      }
      mergeImportedItems(data.items as ParsedRateListRow[], data.skipped ?? 0);
    } catch {
      toast({ type: "error", title: "Import failed", message: "Network error." });
    }
    setImporting(false);
  }

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
      {importing && (
        <div className={styles.importingBanner}>
          <span className={styles.importingSpinner} aria-hidden="true" />
          Importing…
        </div>
      )}
      <div className={styles.itemsHeader}>
        <h2 className="form-section-title">Items</h2>
        <div className={styles.importActions}>
          <button type="button" className={styles.importLinkBtn} onClick={() => setPasteModalOpen(true)}>
            Paste from Excel
          </button>
          <span className={styles.importSep}>·</span>
          <button type="button" className={styles.importLinkBtn} onClick={() => fileInputRef.current?.click()}>
            Upload .xlsx / .csv
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className={styles.hiddenFileInput} onChange={handleFileChange} />
        </div>
      </div>
      {itemsError && <p className={styles.itemsErrorMsg} role="alert">{itemsError}</p>}

      <Modal
        open={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        title="Paste from Excel"
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" size="md" onClick={() => setPasteModalOpen(false)}>Cancel</Button>
            <Button type="button" variant="primary" size="md" onClick={handlePasteImport} disabled={!pasteText.trim()}>Import</Button>
          </>
        }
      >
        <div className={styles.pasteForm}>
          <p className={styles.pasteHint}>
            Copy a range of rows/columns from Excel (Name, Brand, Unit, Discount %, List Rate — in that order, or with a header row) and paste below.
            A cell that says <strong>&quot;Net Rate&quot;</strong> (or a blank Discount) is treated as no discount.
          </p>
          <Textarea
            rows={10}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Sodium Nitrate\tQUALIGENS\t500 GM\t46%\t1130\nEthanol\tQUALIGENS\t500 ML\tNet Rate\t600"}
            className={styles.pasteTextarea}
          />
        </div>
      </Modal>

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
                    {h}{["Item", "Unit", "List Rate (₹)"].includes(h) && <span className={styles.thRequired}> *</span>}
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
                      <Input sz="sm" value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="e.g. Sodium Nitrate" maxLength={200} />
                    </td>
                    <td className={styles.tdBrand}>
                      <Input sz="sm" value={item.brand} onChange={(e) => updateItem(idx, "brand", e.target.value)} placeholder="e.g. QUALIGENS" maxLength={100} />
                    </td>
                    <td className={styles.tdUnit}>
                      {/* Plain input, not UnitCombo — this table sits inside
                          .itemsTableWrap's overflow-x:auto, which clips an
                          absolutely-positioned dropdown before it can render
                          below the fold. UnitCombo is still correct for the
                          invoice/purchase-bill quick-add modals, which aren't
                          inside a scrolling container. */}
                      <Input sz="sm" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="e.g. 500 GM" className={styles.numInputCenter} maxLength={50} />
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
        <div className={styles.emptyItems}>No items yet. Add your first row below, or paste/upload from Excel above.</div>
      )}

      <button type="button" className={styles.addRowBtn} onClick={addRow}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Add Row
      </button>
    </div>
  );
}
