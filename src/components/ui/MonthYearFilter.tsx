"use client";

import { Select } from "./Select";
import { MONTH_NAMES } from "@/lib/dateFilter";
import styles from "./MonthYearFilter.module.css";

interface MonthYearFilterProps {
  month: string; // "" = All Months, else "0".."11"
  year: string;  // "" = All Years, else "YYYY"
  years: number[];
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
  label?: string;
}

// Month + Year dropdown pair — filters an already-fetched list client-side
// by a record's date field, matching the search/sort/status filters already
// on the Invoices/Purchase Bills/Credit Notes list pages (all client-side).
export function MonthYearFilter({ month, year, years, onMonthChange, onYearChange, label = "Period" }: MonthYearFilterProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{label}</span>
      <Select aria-label="Filter by month" value={month} onChange={(e) => onMonthChange(e.target.value)} className={styles.select}>
        <option value="">All Months</option>
        {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </Select>
      <Select aria-label="Filter by year" value={year} onChange={(e) => onYearChange(e.target.value)} className={styles.select}>
        <option value="">All Years</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  );
}
