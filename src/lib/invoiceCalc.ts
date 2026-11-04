import { computeRoundOff, round2 } from "./roundOff";

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
  // Purchase Price — used both to flag a line priced at/below cost, and (with listPrice/
  // discountPercent below) to decide what InvoiceLineItemsCard.tsx's addProduct() prefills a new
  // line with. There's no stored flag distinguishing "Selling Price was left at its auto-default"
  // from "deliberately priced at cost" (see ProductFormFields.tsx's resolveSellingPrice()) — a
  // Selling Price that still equals Purchase Price is treated as the former, and List Price/
  // Discount % (the vendor's own terms) is prefilled instead when available.
  purchasePrice?: number | null;
  listPrice?: number | null;
  discountPercent?: number | null;
}

// Subset of InvoiceLineItem needed for GST math — lets route handlers (plain request-body shapes) reuse this.
export interface LineCalcInput {
  qty: number; price: number; gstRate: number; discountPercent: number;
}

// Discount applied before GST (taxable = gross - discount). Single source of truth,
// used by both invoice client forms and the create/edit API routes.
//
// Every figure is rounded to whole paise AT THE LINE, in the order they are printed (gross -> discount -> taxable
// -> GST -> line total). The document's subtotal and tax are then plain sums of those printed 2-dp lines, so a
// printed invoice always foots exactly — previously only the grand total was rounded, and a % discount or a
// fractional quantity could leave the printed lines ₹0.01 away from the printed subtotal/GST.
export function lineBreakdown(item: LineCalcInput) {
  const gross = round2(item.qty * item.price);
  const discountAmount = round2((gross * item.discountPercent) / 100);
  const taxable = round2(gross - discountAmount);
  const gstAmt = round2((taxable * item.gstRate) / 100);
  return { gross, discountAmount, taxable, gstAmt, total: round2(taxable + gstAmt) };
}

// transportCharge/transportChargeGstRate: optional freight line with its own GST, kept out of
// the item-only taxBreakdown/CGST-SGST-IGST split, added straight into the grand total.
export function computeInvoiceTotals(items: InvoiceLineItem[], transportCharge = 0, transportChargeGstRate = 0) {
  const grossTotal = round2(items.reduce((sum, item) => sum + lineBreakdown(item).gross, 0));
  const discountTotal = round2(items.reduce((sum, item) => sum + lineBreakdown(item).discountAmount, 0));
  const subtotal = round2(items.reduce((sum, item) => sum + lineBreakdown(item).taxable, 0));
  const taxBreakdown = items.reduce((acc, item) => {
    const { gstAmt } = lineBreakdown(item);
    acc[item.gstRate] = round2((acc[item.gstRate] ?? 0) + gstAmt);
    return acc;
  }, {} as Record<number, number>);
  const totalTax = round2(Object.values(taxBreakdown).reduce((a, b) => a + b, 0));
  const transportChargeGstAmount = round2((transportCharge * transportChargeGstRate) / 100);
  const rawTotal = subtotal + totalTax + transportCharge + transportChargeGstAmount;
  const { roundOff, roundedTotal } = computeRoundOff(rawTotal);
  return {
    grossTotal, discountTotal, subtotal, taxBreakdown, totalTax,
    transportCharge, transportChargeGstRate, transportChargeGstAmount,
    rawTotal, roundOff, grandTotal: roundedTotal,
  };
}
