import { rules, validate } from "@/lib/validation";

export const PRODUCT_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen"];
export const PRODUCT_GST_RATES = [0, 5, 12, 18, 28];

export interface ProductFormData {
  name: string; sku: string; description: string; unit: string;
  price: string; purchasePrice: string; gstRate: string; stock: string; minStock: string;
  brandId: string; categoryId: string;
}

export type ProductFieldErrors = { name?: string; price?: string; purchasePrice?: string; stock?: string; minStock?: string };

export function validateProductForm(form: ProductFormData): ProductFieldErrors {
  const nameErr          = validate(form.name,  rules.required("Product name is required."));
  const priceErr         = validate(form.price, rules.required("Price is required."), rules.positiveNumber("Price must be greater than 0."));
  const purchasePriceErr = form.purchasePrice.trim() ? validate(form.purchasePrice, rules.nonNegativeNumber("Purchase price cannot be negative.")) : null;
  const stockErr         = validate(form.stock, rules.required("Stock is required."), rules.nonNegativeNumber("Stock cannot be negative."));
  const minStockErr      = validate(form.minStock, rules.required("Minimum stock is required."), rules.nonNegativeNumber("Minimum stock cannot be negative."));
  return {
    name: nameErr ?? undefined,
    price: priceErr ?? undefined,
    purchasePrice: purchasePriceErr ?? undefined,
    stock: stockErr ?? undefined,
    minStock: minStockErr ?? undefined,
  };
}

export function hasProductFieldErrors(errors: ProductFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}
