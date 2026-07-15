import { computeRoundOff } from "./roundOff";

export interface PurchaseBillLineItem {
  key: string;
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  gstRate: string;
  discountPercent: string;
}

export interface PurchaseBillProduct {
  id: string; name: string; sku: string | null; unit: string; price: number; purchasePrice: number | null; gstRate: number;
}

export interface PurchaseBillVendor { id: string; name: string; company: string | null; gstin?: string | null; }

export const PURCHASE_BILL_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pack", "Set", "Mtr", "Dozen", "Pair"];
export const PURCHASE_BILL_GST_RATES = ["0", "5", "12", "18", "28"];
export const PURCHASE_BILL_CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
export const PURCHASE_BILL_MARGIN_PRESETS = ["10", "15", "20", "25", "30", "40", "50"];
const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

// A stable per-row id, separate from array index — catalogSalePrice/
// catalogMarginPct/catalogSaving state in PurchaseBillItemsTable is keyed by
// this so removing a row can't silently misapply another row's saved margin
// after the array shifts.
let itemKeySeq = 0;
export function makeBlankPurchaseBillItem(): PurchaseBillLineItem {
  itemKeySeq += 1;
  return { key: `item-${itemKeySeq}`, productId: "", name: "", unit: "Pcs", quantity: "1", purchasePrice: "", gstRate: "18", discountPercent: "0" };
}

// A custom typed amount rarely lands on a preset % exactly — inject it into
// the option list (rounded to 2dp) so the select actually shows/highlights
// it instead of falling back to blank.
export function discountOptionsFor(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  if (DISCOUNT_OPTIONS.includes(rounded)) return DISCOUNT_OPTIONS;
  return [...DISCOUNT_OPTIONS, rounded].sort((a, b) => a - b);
}

export function toNum(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }
export const fmtCurrency = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Discount is applied to the line's gross amount (qty × rate) before GST —
// taxable value = gross - discount, and GST is computed on that taxable value.
// Mirrors the sales invoice line calculation for consistency. This is the
// single source of truth for this calc — used by both the purchase-bill
// client forms (via calcPurchaseBillItem below) and the purchase-bill
// create/edit API routes, which already have numeric values in hand.
export function purchaseBillLineBreakdown(qty: number, price: number, rate: number, percent: number) {
  const gross           = qty * price;
  const discountAmount  = gross * percent / 100;
  const subtotal  = gross - discountAmount;
  const gstAmount = subtotal * rate / 100;
  return { gross, discountAmount, subtotal, gstAmount, total: subtotal + gstAmount };
}

export function calcPurchaseBillItem(item: PurchaseBillLineItem) {
  return purchaseBillLineBreakdown(toNum(item.quantity), toNum(item.purchasePrice), toNum(item.gstRate), toNum(item.discountPercent));
}

export function computePurchaseBillTotals(items: PurchaseBillLineItem[], discount: string) {
  const grossTotal        = items.reduce((s, i) => s + calcPurchaseBillItem(i).gross, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + calcPurchaseBillItem(i).discountAmount, 0);
  const subtotal          = items.reduce((s, i) => s + calcPurchaseBillItem(i).subtotal, 0);
  const taxTotal          = items.reduce((s, i) => s + calcPurchaseBillItem(i).gstAmount, 0);
  const disc = toNum(discount);
  const rawTotal = subtotal + taxTotal - disc;
  const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
  return { grossTotal, itemDiscountTotal, subtotal, taxTotal, rawTotal, roundOff, grandTotal: roundedTotal };
}
