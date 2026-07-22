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
  roundOff: number;
  grandTotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;
}

// Subtotal / item discount / GST / additional discount input / grand total —
// shared by the New Purchase Bill and Edit Purchase Bill pages so the two
// forms can't drift apart.
export function PurchaseBillTotals({ sectionIndex, grossTotal, itemDiscountTotal, taxTotal, roundOff, grandTotal, discount, onDiscountChange }: PurchaseBillTotalsProps) {
  return (
    <div {...animateSection(sectionIndex, "form-card")}>
      <div className={styles.totalsWrap}>
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
      </div>
    </div>
  );
}
