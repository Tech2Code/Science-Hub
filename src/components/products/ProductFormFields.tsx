"use client";

import { useRef } from "react";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { UnitCombo } from "@/components/ui/UnitCombo";
import { PRODUCT_UNITS, type ProductFormData, type ProductFieldErrors } from "@/lib/productForm";
import { useUnitSuggestions } from "@/lib/useUnitSuggestions";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

interface ProductFormFieldsProps {
  form: ProductFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onUnitChange: (value: string) => void;
  fieldErrors: ProductFieldErrors;
  brands: Brand[];
  categories: Category[];
  disabled?: boolean;
  stockLabel?: string;
  stockReadOnly?: boolean;
  minStockAutoSuggested?: boolean;
}

// Product name/SKU/description/unit/price/GST/stock/brand/category fields —
// shared by the New Product and Edit Product pages so the two forms can't drift apart.
export function ProductFormFields({ form, onChange, onUnitChange, fieldErrors, brands, categories, disabled, stockLabel = "Opening Stock", stockReadOnly = false, minStockAutoSuggested = false }: ProductFormFieldsProps) {
  // Vendor bills usually quote a List Price minus a trade discount% (e.g. "60% off") rather than
  // the already-net per-unit cost this form needs. List Price and Discount % are real, persisted
  // fields (not just a client-side calculator) so a Purchase Bill line item added from the catalog
  // can prefill its own List Price/Discount % columns the same way the bill's own "Add Custom Item"
  // popup does (see PurchaseBillItemsTable's addProduct()). Purchase Price is purely computed from
  // them (List Price is mandatory, so this always has a basis) — never a separate typed/overridable
  // field, so it can never drift out of sync with the List Price/Discount % that produced it. This
  // is deliberately independent of Selling Price (form.price, the customer-facing rate used on
  // invoices) — the two are unrelated numbers that happen to both get called "price" in casual
  // conversation.
  const unitSuggestions = useUnitSuggestions(PRODUCT_UNITS);
  // Selling Price defaults to Purchase Price (resolveSellingPrice(), at submit for a blank field —
  // or, on an already-saved product, because a past submit literally wrote that same number into
  // Product.price). Either way there's no stored flag saying "this is still just the default" —
  // so treat "Selling Price currently equals Purchase Price" as that proxy: while true (and the
  // user hasn't typed into Selling Price directly this session), keep it mirroring Purchase Price
  // as List Price/Discount % change it, instead of silently going stale. The moment it diverges by
  // the user's own hand, stop touching it.
  const sellingPriceEditedManually = useRef(false);

  function handleGstRateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d.]/g, "");
    if (!/^(100(\.\d*)?|\d{0,2}(\.\d*)?)$/.test(cleaned)) return;
    e.target.value = cleaned;
    onChange(e);
  }

  function handleSellingPriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    sellingPriceEditedManually.current = true;
    onChange(e);
  }

  // Applies a newly-computed Purchase Price and, if Selling Price was only ever mirroring the old
  // Purchase Price value (never typed into directly), carries Selling Price to the same new value
  // so it doesn't silently drift from cost.
  function updatePurchasePrice(newValue: string) {
    const oldPurchaseNum = parseFloat(form.purchasePrice);
    const priceNum = parseFloat(form.price);
    const wasMirroringPurchasePrice = !sellingPriceEditedManually.current
      && form.price.trim() !== ""
      && Number.isFinite(oldPurchaseNum) && Number.isFinite(priceNum)
      && Math.abs(priceNum - oldPurchaseNum) < 0.005;
    onChange({ target: { name: "purchasePrice", value: newValue } } as unknown as React.ChangeEvent<HTMLInputElement>);
    if (wasMirroringPurchasePrice) {
      onChange({ target: { name: "price", value: newValue } } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  }

  function applyPurchasePriceFromListAndDiscount(listPriceStr: string, discountStr: string) {
    if (!listPriceStr.trim()) {
      updatePurchasePrice("");
      return;
    }
    const listPrice = parseFloat(listPriceStr);
    if (!(listPrice >= 0)) return;
    const discount = parseFloat(discountStr) || 0;
    const rounded = Math.round(listPrice * (1 - discount / 100) * 100) / 100;
    updatePurchasePrice(String(rounded));
  }

  function handleListPriceChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e);
    applyPurchasePriceFromListAndDiscount(e.target.value, form.discountPercent);
  }

  function handleDiscountPercentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d.]/g, "");
    if (!/^(100(\.\d*)?|\d{0,2}(\.\d*)?)$/.test(cleaned)) return;
    e.target.value = cleaned;
    onChange(e);
    applyPurchasePriceFromListAndDiscount(form.listPrice, cleaned);
  }

  const hasListPrice = form.listPrice.trim() !== "";

  const sellingPriceNum = parseFloat(form.price);
  const purchasePriceNum = parseFloat(form.purchasePrice);
  const hasSellingPrice = form.price.trim() !== "" && sellingPriceNum >= 0;
  const hasPurchasePrice = form.purchasePrice.trim() !== "" && purchasePriceNum >= 0;
  // Live margin % over Purchase Price, shown in the Selling Price hint so a typed amount's
  // markup (or shortfall) is visible immediately instead of only after saving.
  const marginPct = hasSellingPrice && hasPurchasePrice && purchasePriceNum > 0
    ? ((sellingPriceNum - purchasePriceNum) / purchasePriceNum) * 100
    : null;
  const sellingBelowCost = marginPct != null && marginPct < 0;
  const sellingPriceHint = !hasSellingPrice
    ? "Defaults to Purchase Price."
    : sellingBelowCost
      ? `${Math.abs(marginPct).toFixed(1)}% below cost (₹${form.purchasePrice}).`
      : marginPct != null
        ? `${marginPct.toFixed(1)}% margin over Purchase Price.`
        : "Enter a Purchase Price to see margin %.";

  return (
    <>
      <div className="form-grid-3">
        <FormField label="Product Name" required error={fieldErrors.name}>
          <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. Beaker 250ml Borosilicate" maxLength={200} disabled={disabled} />
        </FormField>
        <FormField label="SKU / Item Code">
          <Input name="sku" value={form.sku} onChange={onChange} placeholder="e.g. BKR-250-BOR" mono maxLength={50} disabled={disabled} />
        </FormField>
        <FormField label="HSN/SAC" hint="Used on invoices & purchase bills.">
          <Input
            name="hsn" value={form.hsn} maxLength={8} mono disabled={disabled} placeholder="e.g. 7017"
            onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8); onChange(e); }}
          />
        </FormField>
      </div>

      <FormField label="Description">
        <Textarea name="description" rows={2} value={form.description} onChange={onChange} placeholder="Brief product description…" maxLength={2000} disabled={disabled} />
      </FormField>

      <div className="form-grid-3">
        <FormField label="Unit" required error={fieldErrors.unit}>
          <UnitCombo
            value={form.unit}
            onChange={onUnitChange}
            suggestions={unitSuggestions}
            placeholder="e.g. Nos, Kg, Box"
          />
        </FormField>
        <FormField label="List Price (₹)" required error={fieldErrors.listPrice} hint="Price before vendor's discount.">
          <Input name="listPrice" type="number" min="0" step="0.01" value={form.listPrice} onChange={handleListPriceChange} placeholder="0.00" disabled={disabled} />
        </FormField>
        <FormField label="Discount %" error={fieldErrors.discountPercent} hint={hasListPrice ? "Vendor's discount, if any." : "Enter a List Price first."}>
          <Input name="discountPercent" type="text" inputMode="decimal" value={form.discountPercent} onChange={handleDiscountPercentChange} placeholder="0" disabled={disabled || !hasListPrice} />
        </FormField>
      </div>

      <div className="form-grid-3">
        <FormField label="Purchase Price (₹)" hint="Computed from List Price − Discount %." error={fieldErrors.purchasePrice}>
          <Input name="purchasePrice" type="number" value={form.purchasePrice} disabled readOnly />
        </FormField>
        <FormField label="GST Rate" required error={fieldErrors.gstRate}>
          <Input name="gstRate" type="text" inputMode="decimal" value={form.gstRate} onChange={handleGstRateChange} placeholder="18" disabled={disabled} />
        </FormField>
        <FormField
          label="Selling Price (₹)"
          error={fieldErrors.price}
          hint={sellingPriceHint}
          hintWarning={sellingBelowCost}
          hintSuccess={marginPct != null && marginPct > 0}
        >
          <Input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleSellingPriceChange} placeholder="0.00" disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField
          label={stockLabel}
          required={!stockReadOnly}
          error={fieldErrors.stock}
          hint={stockReadOnly ? "Use “Adjust Stock” to change this — keeps a reason and history." : undefined}
        >
          <Input name="stock" type="number" min="0" value={form.stock} onChange={onChange} disabled={disabled || stockReadOnly} readOnly={stockReadOnly} />
        </FormField>
        <FormField
          label="Minimum Stock"
          required
          hint={minStockAutoSuggested
            ? "Low-stock alert level. Auto-suggested — adjust if needed."
            : "Low-stock alert level."}
          error={fieldErrors.minStock}
        >
          <Input name="minStock" type="number" min="0" value={form.minStock} onChange={onChange} disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Brand">
          <Select name="brandId" value={form.brandId} onChange={onChange} disabled={disabled}>
            <option value="">— None —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Category">
          <Select name="categoryId" value={form.categoryId} onChange={onChange} disabled={disabled}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
      </div>
    </>
  );
}
