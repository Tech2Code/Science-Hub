"use client";

import { Input, Select } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { INDIA_STATES_FULL } from "@/lib/states";
import { animateSection } from "@/lib/animateSection";
import styles from "./InvoiceOptionsRow.module.css";

const RequiredStar = () => <span style={{ color: "var(--c-red, #dc2626)" }}> *</span>;

interface InvoiceOptionsRowProps {
  sectionIndex: number;
  placeOfSupply: string;
  onPlaceOfSupplyChange: (state: string) => void;
  isInterState: boolean;
  onToggleInterState: () => void;
  reverseCharge: boolean;
  onToggleReverseCharge: () => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  minDueDate?: string;
  // Only the Edit Invoice page passes these — invoice date isn't user-set at
  // creation (always "now" server-side), only correctable afterward. Kept
  // optional so the New Invoice page's layout is untouched.
  invoiceDate?: string;
  onInvoiceDateChange?: (date: string) => void;
  maxInvoiceDate?: string;

  transportChargeEnabled: boolean;
  onToggleTransportCharge: () => void;
  transportCharge: string;
  onTransportChargeChange: (value: string) => void;
  transportChargeGstRate: string;
  onTransportChargeGstRateChange: (value: string) => void;
  transportChargeError?: string;
}

// Place of supply / inter-state (IGST) / reverse charge / due date / transport
// charge — shared by the New Invoice and Edit Invoice pages so the two forms
// can't drift apart.
export function InvoiceOptionsRow({
  sectionIndex,
  placeOfSupply, onPlaceOfSupplyChange,
  isInterState, onToggleInterState,
  reverseCharge, onToggleReverseCharge,
  dueDate, onDueDateChange, minDueDate,
  invoiceDate, onInvoiceDateChange, maxInvoiceDate,
  transportChargeEnabled, onToggleTransportCharge, transportCharge, onTransportChargeChange,
  transportChargeGstRate, onTransportChargeGstRateChange, transportChargeError,
}: InvoiceOptionsRowProps) {
  return (
    <div {...animateSection(sectionIndex, `card ${styles.cardPad}`)}>
      <div className={styles.toggleRow}>
        <div className={styles.dueDateRow}>
          <label className={styles.dueDateLabel}>Place of supply<RequiredStar /></label>
          <Select
            value={placeOfSupply}
            onChange={(e) => onPlaceOfSupplyChange(e.target.value)}
            className={`${styles.dueDateInput} ${styles.placeOfSupplySelect}`}
          >
            <option value="">Select state…</option>
            {INDIA_STATES_FULL.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {onInvoiceDateChange && (
          <div className={styles.dueDateRow}>
            <label className={styles.dueDateLabel}>Invoice date</label>
            <Input
              type="date"
              value={invoiceDate}
              max={maxInvoiceDate}
              onChange={(e) => onInvoiceDateChange(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
              className={`${styles.dueDateInput} ${styles.dueDateDateInput}`}
            />
          </div>
        )}
        <div className={styles.dueDateRow}>
          <label className={styles.dueDateLabel}>Due date</label>
          <Input
            type="date"
            value={dueDate}
            min={minDueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
            className={`${styles.dueDateInput} ${styles.dueDateDateInput}`}
          />
        </div>
        <label className={styles.switchLabel}>
          <Switch checked={isInterState} onChange={onToggleInterState} aria-label="Inter-state supply (IGST)" />
          <span className={styles.switchText}>Inter-state supply (IGST)</span>
        </label>
        <label className={styles.switchLabel}>
          <Switch checked={reverseCharge} onChange={onToggleReverseCharge} aria-label="Reverse charge applicable" />
          <span className={styles.switchText}>Reverse charge applicable</span>
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0.75rem 0" }}>
        <Switch checked={transportChargeEnabled} onChange={onToggleTransportCharge} aria-label="Transport charge" />
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Transport Charge</span>
      </div>
      {transportChargeEnabled && (
        <div className={styles.toggleRow}>
          <div className={styles.dueDateRow}>
            <label className={styles.dueDateLabel}>Amount (₹)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={transportCharge}
              onChange={(e) => onTransportChargeChange(e.target.value)}
              placeholder="0.00"
              className={`${styles.dueDateInput} ${styles.dueDateDateInput}`}
            />
          </div>
          <div className={styles.dueDateRow}>
            <label className={styles.dueDateLabel}>GST Rate (%)<RequiredStar /></label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={transportChargeGstRate}
              onChange={(e) => onTransportChargeGstRateChange(e.target.value)}
              placeholder="18"
              className={`${styles.dueDateInput} ${styles.dueDateDateInput}`}
            />
          </div>
        </div>
      )}
      {transportChargeEnabled && transportChargeError && (
        <p style={{ color: "var(--c-red, #dc2626)", fontSize: "0.8rem", margin: "0.25rem 0 0" }} role="alert">
          {transportChargeError}
        </p>
      )}
    </div>
  );
}
