"use client";

import type { MouseEvent } from "react";
import { Input } from "./Input";
import { Button } from "./Button";
import styles from "./DateRangeFilter.module.css";

// Reports predate this date — nothing to query before it.
export const MIN_REPORT_DATE = "2015-01-01";

interface Props {
  startDate: string;
  endDate: string;
  todayStr: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClear: () => void;
  minDate?: string;
  // Drops this row's own padding/border — for a caller that already nests it inside another
  // bordered/padded toolbar (e.g. a shared `.card-toolbar`), where the standalone chrome would
  // just double up as a second border/inset instead of framing anything of its own.
  inline?: boolean;
}

// Shared "From ... To ... [Clear]" date-range row used by the Sales and Purchase
// report pages — kept as one component so their layout/behavior can't drift apart.
export function DateRangeFilter({ startDate, endDate, todayStr, onStartChange, onEndChange, onClear, minDate = MIN_REPORT_DATE, inline = false }: Props) {
  const openPicker = (e: MouseEvent<HTMLInputElement>) => {
    try { e.currentTarget.showPicker?.(); } catch { /* unsupported browser */ }
  };

  const handleStartChange = (value: string) => {
    onStartChange(value);
    if (endDate && value > endDate) onEndChange(value);
  };

  return (
    <div className={inline ? styles.dateFilterRowInline : styles.dateFilterRow}>
      <label className={styles.dateFilterLabel}>
        From
        <Input
          type="date" aria-label="Start date" value={startDate} min={minDate} max={endDate || todayStr}
          onChange={(e) => handleStartChange(e.target.value)}
          onClick={openPicker}
        />
      </label>
      <label className={styles.dateFilterLabel}>
        To
        <Input
          type="date" aria-label="End date" value={endDate} min={startDate || minDate} max={todayStr}
          onChange={(e) => onEndChange(e.target.value)}
          onClick={openPicker}
        />
      </label>
      {(startDate || endDate) && (
        <Button variant="secondary" size="sm" onClick={onClear}>Clear</Button>
      )}
    </div>
  );
}
