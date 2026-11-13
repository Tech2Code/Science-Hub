"use client";

import { useState } from "react";
import { PeriodFilter, calYearOf, type PeriodCountScope, type PeriodValue } from "@/components/dashboard/PeriodFilter";
import { defaultListPeriod } from "@/lib/listPeriod";
import { DateRangeFilter } from "./DateRangeFilter";
import { Button } from "./Button";
import styles from "./ReportPeriodFilter.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

// The inclusive From/To date strings (IST calendar days) a financial-year period covers, clamped so the end
// never runs past today (a report for the running month/year is "to date", same as the custom date picker's max).
export function periodToDateRange(p: PeriodValue, todayStr: string): { startDate: string; endDate: string } {
  let startDate: string; let endDate: string;
  if (p.month0 === "all") {
    startDate = `${p.fyStartYear}-04-01`; endDate = `${p.fyStartYear + 1}-03-31`;
  } else {
    const y = calYearOf(p.fyStartYear, p.month0); const m = p.month0 + 1;
    startDate = `${y}-${pad(m)}-01`; endDate = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  }
  return { startDate, endDate: endDate > todayStr ? todayStr : endDate };
}

// What a report page should start on: the current IST calendar month inside the current FY.
export function defaultReportRange(todayStr: string): { startDate: string; endDate: string } {
  return periodToDateRange(defaultListPeriod("current"), todayStr);
}

// Formats a startDate..endDate range into a compact period label for report banner cards
// (e.g. "Nov 2026" for a single calendar month, "FY 2026-27" for a full financial year, or "YYYY-MM-DD – YYYY-MM-DD").
export function formatRangePeriodLabel(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return "All Time";
  if (startDate && endDate) {
    // Check if startDate..endDate falls within a single calendar month starting on the 1st.
    if (startDate.endsWith("-01") && startDate.slice(0, 7) === endDate.slice(0, 7)) {
      const [yStr, mStr] = startDate.split("-");
      const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 1, 12));
      return d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    }
    // Check if startDate is Apr 1 of an FY and endDate is within that FY.
    if (startDate.endsWith("-04-01")) {
      const fyStart = Number(startDate.slice(0, 4));
      const fyMaxEnd = `${fyStart + 1}-03-31`;
      if (endDate <= fyMaxEnd && endDate > `${fyStart}-04-30`) {
        return `FY ${fyStart}-${String(fyStart + 1).slice(2)}`;
      }
    }
    return `${startDate} – ${endDate}`;
  }
  return startDate || endDate;
}

interface Props {
  startDate: string;
  endDate: string;
  todayStr: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  minDate?: string;
  inline?: boolean;
  countScope?: PeriodCountScope;
}

// Report period picker with both ways of choosing a period: Financial Year + Month (default — current FY, full year, and
// month) or a Custom From/To range (e.g. a quarter). It reports through the same startDate/endDate strings the
// report pages already use, so switching a page over is only a swap of this component for DateRangeFilter.
export function ReportPeriodFilter({ startDate, endDate, todayStr, onStartChange, onEndChange, minDate, inline = false, countScope }: Props) {
  const [mode, setMode] = useState<"period" | "custom">("period");
  const [period, setPeriod] = useState<PeriodValue>(() => defaultListPeriod());

  function apply(range: { startDate: string; endDate: string }) { onStartChange(range.startDate); onEndChange(range.endDate); }

  function changePeriod(p: PeriodValue) { setPeriod(p); apply(periodToDateRange(p, todayStr)); }

  function switchMode(next: "period" | "custom") {
    setMode(next);
    // Going back to FY + Month re-applies that selection, so what's shown always matches the dates in effect.
    if (next === "period") apply(periodToDateRange(period, todayStr));
  }

  return (
    <div className={inline ? styles.rowInline : styles.row}>
      <div className={styles.modes} role="group" aria-label="Choose period type">
        <Button size="sm" variant={mode === "period" ? "primary" : "secondary"} aria-pressed={mode === "period"} onClick={() => switchMode("period")}>Financial year</Button>
        <Button size="sm" variant={mode === "custom" ? "primary" : "secondary"} aria-pressed={mode === "custom"} onClick={() => switchMode("custom")}>Custom range</Button>
      </div>
      {mode === "period" ? (
        <PeriodFilter value={period} onChange={changePeriod} countScope={countScope} />
      ) : (
        <DateRangeFilter
          inline
          startDate={startDate} endDate={endDate} todayStr={todayStr} minDate={minDate}
          onStartChange={onStartChange} onEndChange={onEndChange}
          onClear={() => { const p = defaultListPeriod(); setPeriod(p); setMode("period"); apply(periodToDateRange(p, todayStr)); }}
        />
      )}
    </div>
  );
}
