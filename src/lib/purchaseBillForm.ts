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
  id: string; name: string; sku: string | null; unit: string; price: number; purchasePrice: number | null;
  listPrice: number | null; discountPercent: number | null;
  gstRate: number; hsn?: string | null;
}

export interface PurchaseBillVendor {
  id: string; name: string; company: string | null; gstin?: string | null; state?: string | null;
  address?: string | null; city?: string | null; pincode?: string | null; phone?: string | null; email?: string | null;
}

export const PURCHASE_BILL_UNITS = ["Nos", "Pcs", "Kg", "500g", "250g", "100g", "g", "Ltr", "500ml", "250ml", "ml", "Box", "Pkt", "Set", "Mtr", "Dozen", "Pair"];
export const PURCHASE_BILL_CATEGORIES = ["Raw Materials", "Lab Chemicals", "Lab Equipment", "Office Supplies", "Packaging", "Services", "Other"];
export const PURCHASE_BILL_MARGIN_PRESETS = ["10", "15", "20", "25", "30", "40", "50"];

// `category` is free text with no assigned-value guarantee (unlike Product's categoryId FK), so
// "no category" can otherwise be represented two ways in the DB — a null column or someone
// literally typing "Uncategorized" — which then show up as two separate rows wherever a report
// groups bills by category (see getPurchaseByCategory in purchase-reports/route.ts). Normalizing
// at write time keeps that ambiguity from ever entering the data, so no downstream aggregation
// has to defend against it. Called from both POST and PUT /api/purchase-bills.
export function normalizeCategoryInput(category: unknown): string | null {
  if (typeof category !== "string") return null;
  const trimmed = category.trim();
  if (!trimmed || trimmed.toLowerCase() === "uncategorized") return null;
  return trimmed;
}

// A stable per-row id, separate from array index.
let itemKeySeq = 0;
export function makePurchaseBillLineItemKey() {
  itemKeySeq += 1;
  return `item-${itemKeySeq}`;
}

export function toNum(s: string) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }
export const fmtCurrency = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Discount applied before GST (mirrors the sales invoice calc). Single source of truth for both
// purchase-bill client forms (via calcPurchaseBillItem) and the create/edit API routes.
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

// List Price minus Discount % — the net (pre-tax) rate. This is what's actually saved as a bill
// line item's purchasePrice: the bill's own per-row calc (calcPurchaseBillItem) applies gstRate to
// this rate separately, so saving a GST-inclusive number here would double-count tax in the bill's
// totals and GST filing reports.
export function computeQuickAddNetRate(listPrice: string, discountPercent: string) {
  const list = toNum(listPrice);
  if (list <= 0) return 0;
  const discount = Math.min(100, Math.max(0, toNum(discountPercent)));
  return Math.round(list * (1 - discount / 100) * 100) / 100;
}

// Purchase Price (net, tax-exclusive) plus GST — shown as an informational "landed cost" hint next
// to the Purchase Price field, so there's a real reference point when setting Selling Price.
export function computeQuickAddTaxInclusivePrice(netRate: number, gstRate: string) {
  const rate = Math.max(0, toNum(gstRate));
  return Math.round(netRate * (1 + rate / 100) * 100) / 100;
}

// The rate (and matching Discount %) to prefill onto a bill's line item when a catalog product is
// picked. A product's Purchase Price can be manually overridden independently of List Price/
// Discount % (see ProductFormFields.tsx) — if it still agrees with List Price × Discount %, carrying
// the discount forward is safe and lets it show up on this bill's own Discount % column; but once
// Purchase Price has diverged (a one-off vendor concession, entered after the fact), reconstructing
// the rate from the now-stale List Price/Discount % would silently discard that override. In that
// case trust Purchase Price itself as the real paid rate, with no further discount applied.
export function resolvePurchaseBillLineRate(p: PurchaseBillProduct): { rate: number | null; discountPercent: string } {
  if (p.listPrice != null) {
    const discount = p.discountPercent ?? 0;
    const computedNet = Math.round(p.listPrice * (1 - discount / 100) * 100) / 100;
    if (p.purchasePrice == null || Math.abs(p.purchasePrice - computedNet) < 0.01) {
      return { rate: p.listPrice, discountPercent: String(discount) };
    }
    return { rate: p.purchasePrice, discountPercent: "0" };
  }
  return { rate: p.purchasePrice ?? p.price, discountPercent: "0" };
}

// Same "trust an override, otherwise carry the discount forward" logic as resolvePurchaseBillLineRate
// above, but for the quick-add modal's own live form state instead of a stored catalog product —
// Purchase Price there is likewise auto-filled from List Price × Discount % but freely overridable.
export function resolveQuickAddLineRate(listPrice: string, discountPercent: string, purchasePrice: string): { rate: string; discountPercent: string } {
  const listNum = toNum(listPrice);
  if (listNum > 0) {
    const computedNet = computeQuickAddNetRate(listPrice, discountPercent);
    if (Math.abs(toNum(purchasePrice) - computedNet) < 0.01) {
      return { rate: listPrice, discountPercent: String(Math.min(100, Math.max(0, toNum(discountPercent)))) };
    }
    return { rate: purchasePrice, discountPercent: "0" };
  }
  return { rate: purchasePrice, discountPercent: "0" };
}

// transportCharge/transportChargeGstRate mirror invoiceCalc.ts — own line/GST, added straight into the grand total.
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
