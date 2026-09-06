import { rules, validate } from "@/lib/validation";

export const PRODUCT_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pkt", "Set", "Mtr", "Dozen"];

// Best-effort starting point for a fresh product's "Minimum Stock" threshold, keyed off its unit —
// a flat default (e.g. "5") makes no sense across a loose bulk measure (grams/ml of a chemical),
// a large container (Kg/Ltr/Box), and a small packaged/discrete item (Nos/Pcs/250g pack). Always
// just a suggestion: the New Product form only applies it while the user hasn't edited the field
// themselves, and it's freely editable either way.
const BULK_LOOSE_UNITS = new Set(["g", "gm", "gram", "grams", "ml", "millilitre", "milliliter", "millilitres", "milliliters"]);
const BULK_CONTAINER_UNITS = new Set(["kg", "kilogram", "kilograms", "ltr", "l", "liter", "litre", "liters", "litres", "box", "dozen", "set", "drum", "carton"]);
export function suggestMinStockForUnit(unit: string): number {
  const u = unit.trim().toLowerCase();
  if (!u) return 5;
  if (BULK_LOOSE_UNITS.has(u)) return 500;
  if (BULK_CONTAINER_UNITS.has(u)) return 3;
  return 10;
}

export interface ProductFormData {
  name: string; sku: string; hsn: string; description: string; unit: string;
  // listPrice/discountPercent: vendor's quoted price + trade discount %, saved as their own
  // columns (not just a client-side calculator) so a Purchase Bill line item added from the
  // catalog can prefill its own List Price/Discount % columns — see PurchaseBillItemsTable's
  // addProduct(). listPrice is mandatory (since 2026-09-06, second pass) — it's the only input
  // purchasePrice is computed from, so every product needs a real value; discountPercent stays
  // optional (0% is a valid discount). The one caller that opts out is bulk import (see
  // ProductBulkImportModal.tsx's listPriceRequired: false), which submits listPrice ==
  // purchasePrice instead of asking for a real one.
  listPrice: string; discountPercent: string;
  // purchasePrice is mandatory too, but purely computed from listPrice/discountPercent above —
  // never a separate typed/overridable field (see ProductFormFields.tsx).
  price: string; purchasePrice: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
}

export type ProductFieldErrors = { name?: string; price?: string; purchasePrice?: string; listPrice?: string; discountPercent?: string; unit?: string; gstRate?: string; stock?: string; minStock?: string };

export function validateProductForm(form: ProductFormData, opts: { listPriceRequired?: boolean } = {}): ProductFieldErrors {
  // Bulk import has no List Price column of its own (see ProductBulkImportModal.tsx's validateRow,
  // which always passes listPrice: "") — it opts out of the required check below rather than being
  // forced to satisfy a field it never collects.
  const { listPriceRequired = true } = opts;
  const nameErr          = validate(form.name,  rules.required("Product name is required."), rules.minLength(2), rules.maxLength(200));
  // Selling Price is optional — left blank, it defaults to Purchase Price (or 0 if that's blank
  // too) at submit time via resolveSellingPrice(), so a product can be catalogued before its
  // customer-facing price is decided.
  const priceErr         = form.price.trim() ? validate(form.price, rules.nonNegativeNumber("Price cannot be negative.")) : null;
  const purchasePriceErr = validate(form.purchasePrice, rules.required("Purchase price is required."), rules.nonNegativeNumber("Purchase price cannot be negative."));
  const listPriceErr     = listPriceRequired
    ? validate(form.listPrice, rules.required("List price is required."), rules.nonNegativeNumber("List price cannot be negative."))
    : (form.listPrice.trim() ? validate(form.listPrice, rules.nonNegativeNumber("List price cannot be negative.")) : null);
  const discountErr      = form.discountPercent.trim() ? validate(form.discountPercent, rules.percentRange(100, "Discount must be between 0 and 100%.")) : null;
  const unitErr          = validate(form.unit, rules.required("Unit is required."));
  const gstRateErr       = validate(form.gstRate, rules.required("GST rate is required."), rules.percentRange(100, "GST rate must be between 0 and 100%."));
  const stockErr         = validate(form.stock, rules.required("Opening stock is required."), rules.nonNegativeNumber("Stock cannot be negative."));
  const minStockErr      = validate(form.minStock, rules.required("Minimum stock is required."), rules.nonNegativeNumber("Minimum stock cannot be negative."));
  return {
    name: nameErr ?? undefined,
    price: priceErr ?? undefined,
    purchasePrice: purchasePriceErr ?? undefined,
    listPrice: listPriceErr ?? undefined,
    discountPercent: discountErr ?? undefined,
    unit: unitErr ?? undefined,
    gstRate: gstRateErr ?? undefined,
    stock: stockErr ?? undefined,
    minStock: minStockErr ?? undefined,
  };
}

export function hasProductFieldErrors(errors: ProductFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

// Selling Price defaults to Purchase Price when left blank (and to 0 if both are blank), so a
// product can be saved before its customer-facing price is decided. Shared by New/Edit Product
// and the bulk-import flow so all three resolve a blank price the same way.
export function resolveSellingPrice(price: string, purchasePrice: string): number {
  if (price.trim()) {
    const parsed = parseFloat(price);
    if (parsed >= 0) return parsed;
  }
  if (purchasePrice.trim()) {
    const parsed = parseFloat(purchasePrice);
    if (parsed >= 0) return parsed;
  }
  return 0;
}
