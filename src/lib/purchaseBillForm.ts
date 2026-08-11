import { computeRoundOff } from "./roundOff";

export interface PurchaseBillLineItem {
  key: string;
  productId: string;
  name: string;
  hsn: string;
  unit: string;
  quantity: string;
  purchasePrice: string;
  gstRate: string;
  discountPercent: string;
}

export interface PurchaseBillProduct {
  id: string; name: string; sku: string | null; unit: string; price: number; purchasePrice: number | null; gstRate: number; hsn?: string | null;
}

export interface PurchaseBillVendor {
  id: string; name: string; company: string | null; gstin?: string | null; state?: string | null;
  address?: string | null; city?: string | null; pincode?: string | null; phone?: string | null; email?: string | null;
}

export const PURCHASE_BILL_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pkt", "Set", "Mtr", "Dozen", "Pair"];
export const PURCHASE_BILL_GST_RATES = ["0", "5", "12", "18", "28"];
export const PURCHASE_BILL_CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
export const PURCHASE_BILL_MARGIN_PRESETS = ["10", "15", "20", "25", "30", "40", "50"];

// A stable per-row id, separate from array index.
let itemKeySeq = 0;
export function makePurchaseBillLineItemKey() {
  itemKeySeq += 1;
  return `item-${itemKeySeq}`;
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

// transportCharge/transportChargeGstRate mirror the sales-invoice side
// (src/lib/invoiceCalc.ts) — own line, own GST, kept out of the item tax
// total and the CGST/SGST/IGST split, added straight into the grand total.
export function computePurchaseBillTotals(items: PurchaseBillLineItem[], discount: string, transportCharge = 0, transportChargeGstRate = 0) {
  const grossTotal        = items.reduce((s, i) => s + calcPurchaseBillItem(i).gross, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + calcPurchaseBillItem(i).discountAmount, 0);
  const subtotal          = items.reduce((s, i) => s + calcPurchaseBillItem(i).subtotal, 0);
  const taxTotal          = items.reduce((s, i) => s + calcPurchaseBillItem(i).gstAmount, 0);
  const disc = toNum(discount);
  const transportChargeGstAmount = (transportCharge * transportChargeGstRate) / 100;
  const rawTotal = subtotal + taxTotal - disc + transportCharge + transportChargeGstAmount;
  const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
  return {
    grossTotal, itemDiscountTotal, subtotal, taxTotal,
    transportCharge, transportChargeGstRate, transportChargeGstAmount,
    rawTotal, roundOff, grandTotal: roundedTotal,
  };
}
