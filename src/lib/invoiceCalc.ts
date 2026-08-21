import { computeRoundOff } from "./roundOff";

export interface InvoiceLineItem {
  key: string;
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
  hsn: string; discountPercent: number;
}

// Stable per-row id (not array index) so removing a row can't make React reuse another row's focus/input state.
let itemKeySeq = 0;
export function makeInvoiceLineItemKey() {
  itemKeySeq += 1;
  return `line-${itemKeySeq}`;
}

export interface InvoiceProduct {
  id: string; name: string; unit: string; price: number; gstRate: number; stock: number; hsn?: string | null;
}

// Subset of InvoiceLineItem needed for GST math — lets route handlers (plain request-body shapes) reuse this.
export interface LineCalcInput {
  qty: number; price: number; gstRate: number; discountPercent: number;
}

// Discount applied before GST (taxable = gross - discount). Single source of truth,
// used by both invoice client forms and the create/edit API routes.
export function lineBreakdown(item: LineCalcInput) {
  const gross = item.qty * item.price;
  const discountAmount = (gross * item.discountPercent) / 100;
  const taxable = gross - discountAmount;
  const gstAmt = (taxable * item.gstRate) / 100;
  return { gross, discountAmount, taxable, gstAmt, total: taxable + gstAmt };
}

// transportCharge/transportChargeGstRate: optional freight line with its own GST, kept out of
// the item-only taxBreakdown/CGST-SGST-IGST split, added straight into the grand total.
export function computeInvoiceTotals(items: InvoiceLineItem[], transportCharge = 0, transportChargeGstRate = 0) {
  const grossTotal = items.reduce((sum, item) => sum + lineBreakdown(item).gross, 0);
  const discountTotal = items.reduce((sum, item) => sum + lineBreakdown(item).discountAmount, 0);
  const subtotal = items.reduce((sum, item) => sum + lineBreakdown(item).taxable, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const { gstAmt } = lineBreakdown(item);
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + gstAmt;
    return acc;
  }, {} as Record<number, number>);
  const totalTax = Object.values(taxBreakdown).reduce((a, b) => a + b, 0);
  const transportChargeGstAmount = (transportCharge * transportChargeGstRate) / 100;
  const rawTotal = subtotal + totalTax + transportCharge + transportChargeGstAmount;
  const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
  return {
    grossTotal, discountTotal, subtotal, taxBreakdown, totalTax,
    transportCharge, transportChargeGstRate, transportChargeGstAmount,
    rawTotal, roundOff, grandTotal: roundedTotal,
  };
}
