import { describe, it, expect } from "vitest";
import { lineBreakdown, computeInvoiceTotals, type InvoiceLineItem } from "@/lib/invoiceCalc";
import { purchaseBillLineBreakdown, computePurchaseBillTotals, type PurchaseBillLineItem } from "@/lib/purchaseBillForm";
import { round2 } from "@/lib/roundOff";

// Deterministic pseudo-random numbers so a failure is reproducible.
function rng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const isPaise = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

describe("line-level rounding (regression: printed lines did not foot to the printed subtotal/GST)", () => {
  it("the old failing example now foots: lines add up to the subtotal and the GST", () => {
    // 3 decimals of quantity + a % discount made every line carry fractions of a paisa.
    const items = [[15.234, 316.66, 12.5], [13.512, 385.52, 5], [4.563, 261.17, 7.5], [10.855, 183.14, 0], [1.041, 694.73, 0]].map(([qty, price, discountPercent], i): InvoiceLineItem =>
      ({ key: String(i), productId: "", productName: "", unit: "Nos", hsn: "", qty, price, gstRate: 18, discountPercent }));
    const t = computeInvoiceTotals(items);
    const lines = items.map(lineBreakdown);
    expect(round2(lines.reduce((s, l) => s + l.taxable, 0))).toBe(t.subtotal);
    expect(round2(lines.reduce((s, l) => s + l.gstAmt, 0))).toBe(t.totalTax);
    expect(t.subtotal).toBe(12983.22); // the six-figure-of-fractions sum used to print 12983.23
  });

  it("a line is made of whole paise, and gross - discount = taxable, taxable + GST = total", () => {
    const l = lineBreakdown({ qty: 20.847, price: 197.14, gstRate: 18, discountPercent: 7.5 });
    for (const v of [l.gross, l.discountAmount, l.taxable, l.gstAmt, l.total]) expect(isPaise(v)).toBe(true);
    expect(round2(l.gross - l.discountAmount)).toBe(l.taxable);
    expect(round2(l.taxable + l.gstAmt)).toBe(l.total);
  });

  it("20,000 random invoices: every document foots exactly (lines -> subtotal, GST, total)", () => {
    const r = rng(7); let bad = 0;
    for (let n = 0; n < 20000; n++) {
      const k = 1 + Math.floor(r() * 8);
      const items: InvoiceLineItem[] = Array.from({ length: k }, (_, i) => ({
        key: String(i), productId: "", productName: "", unit: "Nos", hsn: "",
        qty: Math.round((1 + r() * 20) * 1000) / 1000, price: round2(10 + r() * 990),
        gstRate: [0, 5, 12, 18, 28][Math.floor(r() * 5)], discountPercent: [0, 0, 5, 7.5, 10, 12.5][Math.floor(r() * 6)],
      }));
      const transport = Math.floor(r() * 3) === 0 ? round2(r() * 500) : 0;
      const t = computeInvoiceTotals(items, transport, [0, 5, 18][Math.floor(r() * 3)]);
      const lines = items.map(lineBreakdown);
      const ok =
        round2(lines.reduce((s, l) => s + l.taxable, 0)) === t.subtotal &&
        round2(lines.reduce((s, l) => s + l.gstAmt, 0)) === t.totalTax &&
        round2(lines.reduce((s, l) => s + l.total, 0)) === round2(t.subtotal + t.totalTax) &&
        isPaise(t.transportChargeGstAmount) &&
        Math.abs(t.grandTotal - (t.subtotal + t.totalTax + t.transportCharge + t.transportChargeGstAmount)) <= 0.5 + 1e-9;
      if (!ok) bad++;
    }
    expect(bad).toBe(0);
  });

  it("purchase bills follow the same policy: lines foot to the subtotal and the tax", () => {
    const r = rng(11); let bad = 0;
    for (let n = 0; n < 5000; n++) {
      const k = 1 + Math.floor(r() * 8);
      const items: PurchaseBillLineItem[] = Array.from({ length: k }, (_, i) => ({
        key: String(i), productId: "", name: "x", hsn: "", unit: "Nos",
        quantity: String(Math.round((1 + r() * 20) * 1000) / 1000), purchasePrice: String(round2(10 + r() * 990)),
        gstRate: String([0, 5, 12, 18, 28][Math.floor(r() * 5)]), discountPercent: String([0, 5, 7.5, 10, 12.5][Math.floor(r() * 5)]),
      } as PurchaseBillLineItem));
      const t = computePurchaseBillTotals(items, "0", round2(r() * 300), 18);
      const lines = items.map((i) => purchaseBillLineBreakdown(Number(i.quantity), Number(i.purchasePrice), Number(i.gstRate), Number(i.discountPercent)));
      if (round2(lines.reduce((s, l) => s + l.subtotal, 0)) !== t.subtotal || round2(lines.reduce((s, l) => s + l.gstAmount, 0)) !== t.taxTotal || !isPaise(t.transportChargeGstAmount)) bad++;
    }
    expect(bad).toBe(0);
  });

  it("whole-rupee-quantity, no-discount invoices are unchanged by the rounding", () => {
    const l = lineBreakdown({ qty: 3, price: 100, gstRate: 18, discountPercent: 0 });
    expect(l).toEqual({ gross: 300, discountAmount: 0, taxable: 300, gstAmt: 54, total: 354 });
  });
});
