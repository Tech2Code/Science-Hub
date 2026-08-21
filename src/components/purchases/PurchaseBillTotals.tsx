"use client";

import { Input } from "@/components/ui/Input";
import { animateSection } from "@/lib/animateSection";
import { fmtCurrency } from "@/lib/purchaseBillForm";
import styles from "./PurchaseBillTotals.module.css";

interface PurchaseBillTotalsProps {
  sectionIndex: number;
  grossTotal: number;
  itemDiscountTotal: number;
  taxTotal: number;
  transportCharge?: number;
  transportChargeGstRate?: number;
  transportChargeGstAmount?: number;
  roundOff: number;
  grandTotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;
  footer?: React.ReactNode;
}

// Shared totals card for New/Edit Purchase Bill; `footer` lets a page render its own actions inside this card.
export function PurchaseBillTotals({
  sectionIndex, grossTotal, itemDiscountTotal, taxTotal,
  transportCharge = 0, transportChargeGstRate = 0, transportChargeGstAmount = 0,
  roundOff, grandTotal, discount, onDiscountChange, footer,
}: PurchaseBillTotalsProps) {
  return (
    <div {...animateSection(sectionIndex, "form-card")}>
        <div className={styles.totalsAlignRight}>
          <div className={styles.totalsBox}>
            <div className={styles.totalsLine}>
              <span>Subtotal</span><span>₹{fmtCurrency(grossTotal)}</span>
            </div>
            {itemDiscountTotal > 0 && (
              <div className={styles.totalsLine}>
                <span>Item Discount</span>
                <span className={styles.itemDiscountValue}>−₹{fmtCurrency(itemDiscountTotal)}</span>
              </div>
            )}
            <div className={styles.totalsLine}>
              <span>GST</span><span>₹{fmtCurrency(taxTotal)}</span>
            </div>
            <div className={styles.totalsDiscountLine}>
              <span>Additional Discount (₹)</span>
              <Input sz="sm" type="number" min="0" step="0.01" value={discount} onChange={(e) => onDiscountChange(e.target.value)} className={styles.discountInput} />
            </div>
            {transportCharge > 0 && (
              <div className={styles.totalsLine}>
                <span>Transport Charge</span><span>₹{fmtCurrency(transportCharge)}</span>
              </div>
            )}
            {transportChargeGstAmount > 0 && (
              <div className={styles.totalsLine}>
                <span>Transport GST {transportChargeGstRate}%</span><span>₹{fmtCurrency(transportChargeGstAmount)}</span>
              </div>
            )}
            {roundOff !== 0 && (
              <div className={styles.totalsLine}>
                <span>Round Off</span>
                <span>{roundOff > 0 ? "+" : "−"}₹{Math.abs(roundOff).toFixed(2)}</span>
              </div>
            )}
            <div className={styles.totalsGrandLine}>
              <span>Total</span><span>₹{fmtCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      {footer}
    </div>
  );
}
