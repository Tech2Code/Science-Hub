"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/dialogs/Modal";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Input, FormField } from "@/components/ui/Input";
import { UnitCombo } from "@/components/ui/UnitCombo";
import { useToast } from "@/components/ui/Toast";
import { bustCache, bustCachePrefix } from "@/lib/useCache";
import { useUnitSuggestions } from "@/lib/useUnitSuggestions";
import { rules, validate } from "@/lib/validation";
import { computeQuickAddNetRate, computeQuickAddTaxInclusivePrice, fmtCurrency, toNum } from "@/lib/purchaseBillForm";
import styles from "./QuickAddProductModal.module.css";

export interface QuickAddOutcome {
  skipCatalog: boolean;
  name: string;
  quantity: string;
  qty: number;
  unit: string;
  hsn: string;
  gstRate: string;
  listPrice: string;
  discountPercent: string;
  /** List Price × Discount % — the derived net rate. */
  purchasePriceNum: number;
  /** Present only when a new catalog product was created (skipCatalog === false). Loosely typed —
   *  matches this flow's existing untyped `res.json()` response, not a new relaxation. */
  product?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface QuickAddProductModalProps {
  onClose: () => void;
  /** Caller maps the outcome onto its own line-item shape and pushes it (an Invoice line and a
   *  Purchase Bill line item store the same rate/discount under different field names). */
  onAdd: (outcome: QuickAddOutcome) => void;
  /** "bill" | "invoice" — used in the submit button, checkbox, and toast copy. */
  entityLabel: string;
  defaultUnit: string;
  baseUnits: string[];
  initialName: string;
}

const EMPTY_FORM = { name: "", unit: "", quantity: "1", listPrice: "", discountPercent: "", gstRate: "18", salePrice: "", hsn: "", skipCatalog: false };

type QuickAddErrors = Partial<Record<"name" | "listPrice" | "unit" | "gstRate" | "quantity", string>>;

// Shared "search a product or add a custom one" quick-add popup — used identically by the New/Edit
// Invoice and New/Edit Purchase Bill line-item tables (InvoiceLineItemsCard.tsx / PurchaseBillItemsTable.tsx)
// so the two forms can't drift apart. Owns the whole form, validation, and the POST /api/products
// call; the caller only turns the resulting outcome into its own line-item shape and pushes it.
// The caller mounts this only while the popup should be open (`{show && <QuickAddProductModal .../>}`)
// rather than passing an `open` flag — a fresh mount is what gives the form a blank slate each time,
// with no reset effect needed.
export function QuickAddProductModal({ onClose, onAdd, entityLabel, defaultUnit, baseUnits, initialName }: QuickAddProductModalProps) {
  const toast = useToast();
  const unitFieldId = useId();
  const unitSuggestions = useUnitSuggestions(baseUnits);
  const [form, setForm] = useState({ ...EMPTY_FORM, name: initialName });
  const [errors, setErrors] = useState<QuickAddErrors>({});
  const [saving, setSaving] = useState(false);

  // Purchase Price is always List Price × Discount % — there's no separate typed field for it.
  // Shown as an informational hint (with GST-inclusive landed cost) next to Selling Price instead.
  const purchasePriceNum = computeQuickAddNetRate(form.listPrice, form.discountPercent);
  const gstAmount = Math.round((purchasePriceNum * Math.max(0, toNum(form.gstRate)) / 100) * 100) / 100;
  const landedCost = computeQuickAddTaxInclusivePrice(purchasePriceNum, form.gstRate);

  function handleListPriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d.]/g, "");
    setForm((p) => ({ ...p, listPrice: cleaned }));
    setErrors((p) => ({ ...p, listPrice: undefined }));
  }

  function handleDiscountPercentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d.]/g, "");
    if (!/^(100(\.\d*)?|\d{0,2}(\.\d*)?)$/.test(cleaned)) return;
    setForm((p) => ({ ...p, discountPercent: cleaned }));
  }

  async function handleSubmit() {
    const errs: QuickAddErrors = {
      name: validate(form.name, rules.required("Item name is required."), rules.minLength(2), rules.maxLength(200)) ?? undefined,
      quantity: validate(form.quantity, rules.required("Quantity is required."), rules.positiveNumber()) ?? undefined,
      listPrice: validate(form.listPrice, rules.required("List price is required."), rules.nonNegativeNumber("List price cannot be negative.")) ?? undefined,
      unit: validate(form.unit, rules.required("Unit is required.")) ?? undefined,
      gstRate: validate(form.gstRate, rules.required("GST rate is required."), rules.percentRange(100, "GST rate must be between 0 and 100%.")) ?? undefined,
    };
    if (Object.values(errs).some(Boolean)) { setErrors(errs); return; }
    setErrors({});
    const qty = parseFloat(form.quantity) || 1;
    const clampedDiscount = String(Math.min(100, Math.max(0, toNum(form.discountPercent))));

    if (form.skipCatalog) {
      onAdd({
        skipCatalog: true, name: form.name.trim(), quantity: form.quantity, qty,
        unit: form.unit.trim() || defaultUnit, hsn: form.hsn.trim(), gstRate: form.gstRate,
        listPrice: form.listPrice, discountPercent: form.discountPercent, purchasePriceNum,
      });
      toast({ type: "success", title: "Item added", message: `"${form.name.trim()}" added to this ${entityLabel} only.` });
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit.trim() || defaultUnit,
          price: form.salePrice.trim() || String(purchasePriceNum),
          // Purchase Price is mandatory on every product — always the derived net rate, since List
          // Price is required on this popup. Freely correctable afterward via Product Edit.
          purchasePrice: String(purchasePriceNum),
          listPrice: form.listPrice,
          discountPercent: clampedDiscount,
          gstRate: form.gstRate,
          hsn: form.hsn.trim() || undefined,
          stock: 0,
        }),
      });
      const d = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) { toast({ type: "error", title: "Failed", message: d?.error ?? "Could not add product." }); return; }
      bustCachePrefix("/api/products");
      bustCache("/api/units");
      onAdd({
        skipCatalog: false, name: form.name.trim(), quantity: form.quantity, qty,
        unit: form.unit.trim() || defaultUnit, hsn: form.hsn.trim(), gstRate: form.gstRate,
        listPrice: form.listPrice, discountPercent: form.discountPercent, purchasePriceNum, product: d,
      });
      toast({ type: "success", title: "Product added", message: `"${d.name}" was created and added to this ${entityLabel}.` });
      onClose();
    } catch {
      setSaving(false);
      toast({ type: "error", title: "Failed", message: "Network error." });
    }
  }

  const salePriceNum = toNum(form.salePrice);
  const salePriceBelowCost = purchasePriceNum > 0 && salePriceNum > 0 && salePriceNum < purchasePriceNum;

  return (
    <>
      {saving && <OverlayLoader text="Adding…" />}
      <Modal
        open
        onClose={() => { if (!saving) onClose(); }}
        title="Add Custom Item"
        variant="fullscreen"
        footer={
          <>
            <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="md" onClick={handleSubmit} disabled={saving}>
              {saving ? "Adding…" : form.skipCatalog ? `Add to ${entityLabel}` : "Save & use product"}
            </Button>
          </>
        }
      >
        <div className={styles.customForm}>
          <FormField label="Item Name" required error={errors.name}>
            <Input
              type="text" placeholder="e.g. Beaker 250ml Borosilicate"
              autoFocus
              value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setErrors((p) => ({ ...p, name: undefined })); }}
              maxLength={200}
            />
          </FormField>
          <div className={styles.grid2}>
            <FormField label="Quantity" required error={errors.quantity}>
              <Input
                type="text" inputMode="decimal" placeholder="1"
                value={form.quantity}
                onChange={(e) => { setForm((p) => ({ ...p, quantity: e.target.value.replace(/[^\d.]/g, "") })); setErrors((p) => ({ ...p, quantity: undefined })); }}
              />
            </FormField>
            <FormField label="Unit" required error={errors.unit} id={unitFieldId}>
              <UnitCombo
                id={unitFieldId}
                value={form.unit}
                onChange={(v) => { setForm((p) => ({ ...p, unit: v })); setErrors((p) => ({ ...p, unit: undefined })); }}
                suggestions={unitSuggestions}
              />
            </FormField>
            <FormField label="List Price (₹)" required error={errors.listPrice} hint="Price before vendor's discount.">
              <Input
                type="text" inputMode="decimal" placeholder="0.00"
                value={form.listPrice}
                onChange={handleListPriceChange}
              />
            </FormField>
            <FormField label="Discount %" hint={form.listPrice.trim() ? "Vendor's discount, if any." : "Enter a List Price first."}>
              <Input
                type="text" inputMode="decimal" placeholder="0"
                value={form.discountPercent}
                onChange={handleDiscountPercentChange}
                disabled={!form.listPrice.trim()}
              />
            </FormField>
            <FormField label="GST %" required error={errors.gstRate}>
              <Input
                type="text" inputMode="decimal" placeholder="18"
                value={form.gstRate}
                onChange={(e) => { setForm((p) => ({ ...p, gstRate: e.target.value.replace(/[^\d.]/g, "") })); setErrors((p) => ({ ...p, gstRate: undefined })); }}
              />
            </FormField>
            {!form.skipCatalog && (
              <FormField
                label="Selling Price (₹)"
                hint={
                  salePriceBelowCost
                    ? `Selling price is lower than purchase price (₹${fmtCurrency(purchasePriceNum)})`
                    : purchasePriceNum > 0
                      ? `Defaults to purchase price ₹${fmtCurrency(purchasePriceNum)} (+₹${fmtCurrency(gstAmount)} GST = ₹${fmtCurrency(landedCost)} landed cost) if left blank`
                      : "Defaults to purchase price (before GST) if left blank"
                }
                hintWarning={salePriceBelowCost}
              >
                <Input
                  type="text" inputMode="decimal" placeholder="0.00"
                  value={form.salePrice}
                  onChange={(e) => setForm((p) => ({ ...p, salePrice: e.target.value.replace(/[^\d.]/g, "") }))}
                />
              </FormField>
            )}
            <FormField label="HSN/SAC" hint="Optional">
              <Input
                type="text" placeholder="e.g. 3822" maxLength={8}
                value={form.hsn}
                onChange={(e) => setForm((p) => ({ ...p, hsn: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
              />
            </FormField>
          </div>
          <label className={styles.skipCatalogLabel}>
            <input
              type="checkbox"
              checked={form.skipCatalog}
              onChange={(e) => setForm((p) => ({ ...p, skipCatalog: e.target.checked }))}
              className={styles.skipCatalogCheckbox}
            />
            Just for this {entityLabel} — don&apos;t save to catalog
          </label>
        </div>
      </Modal>
    </>
  );
}
