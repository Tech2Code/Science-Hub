import { computeRoundOff } from "./roundOff";

export interface InvoiceLineItem {
  key: string;
  productId: string; productName: string; unit: string;
  qty: number; price: number; gstRate: number;
  hsn: string; discountPercent: number;
}

// A stable per-row id, separate from array index, so removing a row can't
// cause React to reuse another row's uncontrolled input/focus state after
// the array shifts (mirrors the same pattern in purchaseBillForm.ts).
let itemKeySeq = 0;
export function makeInvoiceLineItemKey() {
  itemKeySeq += 1;
  return `line-${itemKeySeq}`;
}

export interface InvoiceProduct {
  id: string; name: string; unit: string; price: number; gstRate: number; stock: number; hsn?: string | null;
}

// Subset of InvoiceLineItem actually needed for the GST math — lets API
// route handlers (which work with plain request-body item shapes, not full
// InvoiceLineItem objects) reuse this instead of reimplementing the formula.
export interface LineCalcInput {
  qty: number; price: number; gstRate: number; discountPercent: number;
}

// Discount is applied to the line's gross amount (qty × rate) before GST —
// taxable value = gross - discount, and GST is computed on that taxable value.
// This is the single source of truth for this calc — used by both the sales
// invoice client forms and the invoice create/edit API routes.
export function lineBreakdown(item: LineCalcInput) {
  const gross = item.qty * item.price;
  const discountAmount = (gross * item.discountPercent) / 100;
  const taxable = gross - discountAmount;
  const gstAmt = (taxable * item.gstRate) / 100;
  return { gross, discountAmount, taxable, gstAmt, total: taxable + gstAmt };
}

export function computeInvoiceTotals(items: InvoiceLineItem[]) {
  const grossTotal = items.reduce((sum, item) => sum + lineBreakdown(item).gross, 0);
  const discountTotal = items.reduce((sum, item) => sum + lineBreakdown(item).discountAmount, 0);
  const subtotal = items.reduce((sum, item) => sum + lineBreakdown(item).taxable, 0);
  const taxBreakdown = items.reduce((acc, item) => {
    const { gstAmt } = lineBreakdown(item);
    acc[item.gstRate] = (acc[item.gstRate] ?? 0) + gstAmt;
    return acc;
  }, {} as Record<number, number>);
  const totalTax = Object.values(taxBreakdown).reduce((a, b) => a + b, 0);
  const rawTotal = subtotal + totalTax;
  const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
  return { grossTotal, discountTotal, subtotal, taxBreakdown, totalTax, rawTotal, roundOff, grandTotal: roundedTotal };
}
