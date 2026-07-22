"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { rules, validate } from "@/lib/validation";
import { animateSection } from "@/lib/animateSection";
import { lineBreakdown, makeInvoiceLineItemKey, type InvoiceLineItem, type InvoiceProduct } from "@/lib/invoiceCalc";
import styles from "./InvoiceLineItemsCard.module.css";

const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 50];
const QUICK_ADD_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen"];

// A custom typed amount rarely lands on a preset % exactly — inject it into
// the option list (rounded to 2dp) so the select actually shows/highlights
// it instead of falling back to blank.
function discountOptionsFor(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  if (DISCOUNT_OPTIONS.includes(rounded)) return DISCOUNT_OPTIONS;
  return [...DISCOUNT_OPTIONS, rounded].sort((a, b) => a - b);
}

interface InvoiceLineItemsCardProps {
  sectionIndex: number;
  products: InvoiceProduct[];
  setProducts: Dispatch<SetStateAction<InvoiceProduct[]>>;
  items: InvoiceLineItem[];
  setItems: Dispatch<SetStateAction<InvoiceLineItem[]>>;
}

// Product search + line-items table, shared by the New Invoice and Edit
// Invoice pages (including the "quick add product" flow) so the two forms
// can't drift apart.
export function InvoiceLineItemsCard({ sectionIndex, products, setProducts, items, setItems }: InvoiceLineItemsCardProps) {
  const toast = useToast();
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [quickAddProduct, setQuickAddProduct] = useState({ name: "", unit: "Nos", price: "", gstRate: "18" });
  const [quickAddErrors, setQuickAddErrors] = useState<Partial<Record<"name" | "price" | "gstRate", string>>>({});
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  function addProduct(p: InvoiceProduct) {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx !== -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prev, { key: makeInvoiceLineItemKey(), productId: p.id, productName: p.name, unit: p.unit, qty: 1, price: p.price, gstRate: p.gstRate, hsn: p.hsn ?? "", discountPercent: 0 }];
    });
    setProductSearch(""); setShowProductDropdown(false);
  }

  function openQuickAddProduct() {
    setQuickAddProduct({ name: productSearch, unit: "Nos", price: "", gstRate: "18" });
    setQuickAddErrors({});
    setShowQuickAddProduct(true);
  }

  async function handleQuickAddProduct() {
    const errs: Partial<Record<"name" | "price" | "gstRate", string>> = {
      name: validate(quickAddProduct.name, rules.required("Product name is required.")) ?? undefined,
      price: validate(quickAddProduct.price, rules.required("Price is required."), rules.nonNegativeNumber()) ?? undefined,
      gstRate: validate(quickAddProduct.gstRate, rules.nonNegativeNumber()) ?? undefined,
    };
    if (Object.values(errs).some(Boolean)) { setQuickAddErrors(errs); return; }
    setQuickAddErrors({});
    setQuickAddSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quickAddProduct.name.trim(),
          unit: quickAddProduct.unit.trim() || "Nos",
          price: quickAddProduct.price,
          gstRate: quickAddProduct.gstRate,
          stock: 0,
        }),
      });
      const d = await res.json().catch(() => ({}));
      setQuickAddSaving(false);
      if (!res.ok) { toast({ type: "error", title: "Failed", message: d?.error ?? "Could not add product." }); return; }
      bustCache("/api/products");
      setProducts((prev) => [...prev, d]);
      addProduct(d);
      setShowQuickAddProduct(false);
      setShowProductDropdown(false);
      toast({ type: "success", title: "Product added", message: `"${d.name}" was created and added to this invoice.` });
    } catch {
      setQuickAddSaving(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
  }

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof InvoiceLineItem, value: string | number) {
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

  const section = animateSection(sectionIndex, `card ${styles.cardPad}`);

  return (
    <div
      className={section.className}
      style={{ ...section.style, position: "relative", zIndex: showProductDropdown ? 5 : "auto" }}
    >
      <h2 className={styles.lineItemsHeading}>Line Items</h2>
      <div className={styles.productSearchWrap}>
        <Input
          type="text"
          placeholder="Search and add product…"
          value={productSearch}
          onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
          onFocus={() => setShowProductDropdown(true)}
          onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
          className={styles.input}
        />
        {showProductDropdown && (
          <div className={styles.dropdown} onMouseDown={(e) => e.preventDefault()}>
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
                <button type="button" className={styles.dropdownEmptyLink} onMouseDown={(e) => e.preventDefault()} onClick={openQuickAddProduct}>
                  Add new product →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showQuickAddProduct && (
        <div className={styles.customForm}>
          <div>
            <Input
              type="text" placeholder="Product name *"
              value={quickAddProduct.name}
              onChange={(e) => { setQuickAddProduct((p) => ({ ...p, name: e.target.value })); setQuickAddErrors((p) => ({ ...p, name: undefined })); }}
              className={quickAddErrors.name ? styles.inputError : styles.input}
            />
            {quickAddErrors.name && <p className={styles.errMsg}>{quickAddErrors.name}</p>}
          </div>
          <div className={styles.grid3}>
            <Select
              value={quickAddProduct.unit}
              onChange={(e) => setQuickAddProduct((p) => ({ ...p, unit: e.target.value }))}
              className={styles.input}
            >
              {QUICK_ADD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <div>
              <Input
                type="text" inputMode="decimal" placeholder="Price (₹) *"
                value={quickAddProduct.price}
                onChange={(e) => { setQuickAddProduct((p) => ({ ...p, price: e.target.value })); setQuickAddErrors((p) => ({ ...p, price: undefined })); }}
                className={quickAddErrors.price ? styles.inputError : styles.input}
              />
              {quickAddErrors.price && <p className={styles.errMsg}>{quickAddErrors.price}</p>}
            </div>
            <div>
              <Input
                type="text" inputMode="decimal" placeholder="GST %"
                value={quickAddProduct.gstRate}
                onChange={(e) => { setQuickAddProduct((p) => ({ ...p, gstRate: e.target.value })); setQuickAddErrors((p) => ({ ...p, gstRate: undefined })); }}
                className={quickAddErrors.gstRate ? styles.inputError : styles.input}
              />
              {quickAddErrors.gstRate && <p className={styles.errMsg}>{quickAddErrors.gstRate}</p>}
            </div>
          </div>
          <div className={styles.grid2}>
            <Button type="button" variant="primary" size="sm" onClick={handleQuickAddProduct} disabled={quickAddSaving}>
              {quickAddSaving ? "Adding…" : "Add & use product"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowQuickAddProduct(false)} disabled={quickAddSaving}>
              Cancel
            </Button>
          </div>
          <p className={styles.customFormHint}>
            This product will be saved to your catalog and added to this invoice.
          </p>
        </div>
      )}

      {items.length > 0 ? (
        <div className={styles.itemsTableWrap}>
          <table className={styles.itemsTable}>
            <thead>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>Product</th>
                <th className={styles.thCenter}>HSN/SAC</th>
                <th className={styles.thCenter}>Unit</th>
                <th className={styles.thCenter}>Qty</th>
                <th className={styles.thRight}>List Price (₹)</th>
                <th className={styles.thCenter}>Discount</th>
                <th className={styles.thCenter}>GST %</th>
                <th className={styles.thRight}>GST Amt</th>
                <th className={styles.thRight}>Total (₹)</th>
                <th className={styles.thAction} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const { discountAmount, gstAmt: lineGst, total: lineTotal } = lineBreakdown(item);
                return (
                  <tr key={item.key} className={idx % 2 === 0 ? styles.itemRow : styles.itemRowAlt}>
                    <td className={styles.tdIndex}>{idx + 1}</td>
                    <td className={styles.tdProduct}>
                      <div className={styles.tdProductInner} title={item.productName}>{item.productName}</div>
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        type="text" value={item.hsn}
                        onChange={(e) => updateItem(idx, "hsn", e.target.value)}
                        placeholder="HSN/SAC"
                        className={styles.hsnInput}
                      />
                    </td>
                    <td className={styles.tdCenter}>
                      <span className={styles.unitBadge}>
                        {item.unit}
                      </span>
                    </td>
                    <td className={styles.tdCenter}>
                      <Input
                        type="number" min="1" value={item.qty}
                        onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 1)}
                        className={styles.qtyInput}
                      />
                    </td>
                    <td className={styles.tdRight}>
                      <Input
                        type="text" inputMode="decimal" value={item.price}
                        onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                        className={styles.priceInput}
                      />
                    </td>
                    <td className={styles.discountCell}>
                      <div className={styles.discountStack}>
                        <Select
                          value={Math.round(item.discountPercent * 100) / 100}
                          onChange={(e) => updateItem(idx, "discountPercent", parseFloat(e.target.value) || 0)}
                          className={styles.discountSelect}
                        >
                          {discountOptionsFor(item.discountPercent).map((d) => <option key={d} value={d}>{d}%</option>)}
                        </Select>
                        <Input
                          type="text" inputMode="decimal"
                          value={discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : ""}
                          onChange={(e) => setDiscountAmount(idx, e.target.value)}
                          placeholder="₹0"
                          title="Flat discount amount"
                          className={styles.discountAmountInput}
                        />
                      </div>
                    </td>
                    <td className={styles.tdCenter}>
                      <span className={styles.gstBadge}>
                        {item.gstRate}%
                      </span>
                    </td>
                    <td className={styles.tdGstAmt}>
                      ₹{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={styles.tdTotal}>
                      ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={styles.tdActionCell}>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className={styles.removeBtn}>
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
