"use client";

import { Input, Select } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { INDIA_STATES } from "@/lib/states";
import { animateSection } from "@/lib/animateSection";
import styles from "./InvoiceOptionsRow.module.css";

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
}

// Place of supply / inter-state (IGST) / reverse charge / due date — shared by
// the New Invoice and Edit Invoice pages so the two forms can't drift apart.
export function InvoiceOptionsRow({
  sectionIndex,
  placeOfSupply, onPlaceOfSupplyChange,
  isInterState, onToggleInterState,
  reverseCharge, onToggleReverseCharge,
  dueDate, onDueDateChange, minDueDate,
}: InvoiceOptionsRowProps) {
  return (
    <div {...animateSection(sectionIndex, `card ${styles.cardPad}`)}>
      <div className={styles.toggleRow}>
        <div className={styles.dueDateRow}>
          <label className={styles.dueDateLabel}>Place of supply *</label>
          <Select
            value={placeOfSupply}
            onChange={(e) => onPlaceOfSupplyChange(e.target.value)}
            className={`${styles.dueDateInput} ${styles.placeOfSupplySelect}`}
          >
            <option value="">Select state…</option>
            {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className={styles.dueDateRow}>
          <label className={styles.dueDateLabel}>Due date</label>
          <Input
            type="date"
            value={dueDate}
            min={minDueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ } }}
            className={styles.dueDateInput}
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
    </div>
  );
}
