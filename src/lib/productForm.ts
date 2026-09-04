import { rules, validate } from "@/lib/validation";

export const PRODUCT_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pkt", "Set", "Mtr", "Dozen"];
export const PRODUCT_GST_RATES = [0, 5, 12, 18, 28];

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
  price: string; purchasePrice: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
}

export type ProductFieldErrors = { name?: string; price?: string; purchasePrice?: string; unit?: string; gstRate?: string; stock?: string; minStock?: string };

export function validateProductForm(form: ProductFormData): ProductFieldErrors {
  const nameErr          = validate(form.name,  rules.required("Product name is required."), rules.minLength(2), rules.maxLength(200));
  const priceErr         = validate(form.price, rules.required("Price is required."), rules.positiveNumber("Price must be greater than 0."));
  const purchasePriceErr = form.purchasePrice.trim() ? validate(form.purchasePrice, rules.nonNegativeNumber("Purchase price cannot be negative.")) : null;
  const unitErr          = validate(form.unit, rules.required("Unit is required."));
  const gstRateErr       = validate(form.gstRate, rules.required("GST rate is required."));
  const stockErr         = validate(form.stock, rules.required("Opening stock is required."), rules.nonNegativeNumber("Stock cannot be negative."));
  const minStockErr      = validate(form.minStock, rules.required("Minimum stock is required."), rules.nonNegativeNumber("Minimum stock cannot be negative."));
  return {
    name: nameErr ?? undefined,
    price: priceErr ?? undefined,
    purchasePrice: purchasePriceErr ?? undefined,
    unit: unitErr ?? undefined,
    gstRate: gstRateErr ?? undefined,
    stock: stockErr ?? undefined,
    minStock: minStockErr ?? undefined,
  };
}

export function hasProductFieldErrors(errors: ProductFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}
