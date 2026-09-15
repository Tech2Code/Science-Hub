"use client";

import { useMemo } from "react";
import { getIndianFinancialYear } from "@/lib/documentNumbering";
import { useFetch } from "@/lib/useCache";
import { Select } from "@/components/ui/Select";
import styles from "./PeriodFilter.module.css";

// The period the dashboard / overview pages scope to: a financial year (its Apr start-year), and
// either the whole year ("all") or a specific month (0-based, IST calendar month).
export interface PeriodValue {
  fyStartYear: number;
  month0: number | "all";
}

interface FinancialYearsResponse {
  years: { startYear: number; label: string }[];
}

const FY_LABEL = (startYear: number) => `FY ${startYear}-${String(startYear + 1).slice(2)}`;

// The calendar year an FY-month falls in: Jan–Mar (0–2) belong to the FY's SECOND year, Apr–Dec to the first.
function calYearOf(fyStartYear: number, month0: number): number {
  return month0 >= 3 ? fyStartYear : fyStartYear + 1;
}

// A month label matching the app's date convention exactly (en-IN, IST). `long` → "September 2026"
// (like formatMonthYear), otherwise `short` → "Sep 2026" (like formatDate's month). Built from an
// IST-noon instant of the 1st so the day never drifts across the IST/UTC boundary when formatted.
function monthLabel(fyStartYear: number, month0: number, style: "short" | "long"): string {
  const calYear = calYearOf(fyStartYear, month0);
  // Noon UTC on the 1st stays the 1st in IST (UTC+5:30) — safe for a month-name label.
  return new Date(Date.UTC(calYear, month0, 1, 12)).toLocaleString("en-IN", { month: style, year: "numeric", timeZone: "Asia/Kolkata" });
}

// The current financial year's start-year, computed the same way the server does.
export function currentFyStartYear(): number {
  return getIndianFinancialYear(new Date());
}

// The default period shown on first load: the current FY, whole year.
export function defaultPeriod(): PeriodValue {
  return { fyStartYear: currentFyStartYear(), month0: "all" };
}

// Serialises a period into the query string the reports API expects (?fy=YYYY[&month=M]).
export function periodToQuery(p: PeriodValue): string {
  const base = `fy=${p.fyStartYear}`;
  return p.month0 === "all" ? base : `${base}&month=${p.month0 + 1}`;
}

// Short human label, e.g. "FY 2026-27" or "Aug 2026". Matches the app's date convention (en-IN, IST)
// and the server-built financials.monthly labels exactly, so dashboard month-matching stays aligned.
export function periodLabel(p: PeriodValue): string {
  if (p.month0 === "all") return FY_LABEL(p.fyStartYear);
  return monthLabel(p.fyStartYear, p.month0, "short");
}

// The 12 months of a financial year in order (Apr → Mar), each with its 0-based month index, the
// calendar year it falls in, and a label. For the CURRENT FY, months after the current one are
// marked future (so the picker can disable them); past FYs have all 12 available.
function fyMonths(fyStartYear: number): { month0: number; label: string; future: boolean }[] {
  const now = new Date();
  // en-CA formats as "YYYY-MM" (year first), so splitting on "-" gives [year, month] in the right
  // order. (en-IN returns "MM/YYYY" — month first — which previously flipped these and marked every
  // month as "future", disabling the whole list.)
  const [istY, istM] = now.toLocaleString("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" }).split("-");
  const nowYm = Number(istY) * 100 + Number(istM);
  return Array.from({ length: 12 }, (_, i) => {
    const month0 = (3 + i) % 12;                        // Apr(3) … Mar(2)
    const ym = calYearOf(fyStartYear, month0) * 100 + (month0 + 1);
    const label = monthLabel(fyStartYear, month0, "long");
    return { month0, label, future: ym > nowYm };
  });
}

// Two dropdowns — Financial Year + Month — sharing the app's common <Select>. Changing the FY keeps
// the month choice if that month exists & isn't in the future, otherwise falls back to "Full year".
export function PeriodFilter({ value, onChange, disabled, className }: {
  value: PeriodValue;
  onChange: (p: PeriodValue) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { data } = useFetch<FinancialYearsResponse>("/api/reports?type=financial-years");
  // Always include the current FY and the currently-selected FY, even before the list loads.
  const years = useMemo(() => {
    const fromApi = data?.years?.map((y) => y.startYear) ?? [];
    const set = new Set<number>([...fromApi, currentFyStartYear(), value.fyStartYear]);
    return Array.from(set).sort((a, b) => b - a);   // newest first
  }, [data, value.fyStartYear]);

  const months = useMemo(() => fyMonths(value.fyStartYear), [value.fyStartYear]);

  return (
    <div className={`${styles.group} ${className ?? ""}`}>
      <Select
        value={String(value.fyStartYear)}
        disabled={disabled}
        aria-label="Select financial year"
        wrapClassName={styles.fySelect}
        onChange={(e) => {
          const fyStartYear = Number(e.target.value);
          // If the kept month is now in the future for this FY, reset to the whole year.
          const stillValid = value.month0 !== "all" && !fyMonths(fyStartYear).find((m) => m.month0 === value.month0)?.future;
          onChange({ fyStartYear, month0: stillValid ? value.month0 : "all" });
        }}
      >
        {years.map((y) => <option key={y} value={y}>{FY_LABEL(y)}</option>)}
      </Select>

      <Select
        value={value.month0 === "all" ? "all" : String(value.month0)}
        disabled={disabled}
        aria-label="Select month"
        wrapClassName={styles.monthSelect}
        onChange={(e) => onChange({ fyStartYear: value.fyStartYear, month0: e.target.value === "all" ? "all" : Number(e.target.value) })}
      >
        <option value="all">Full year</option>
        {months.map((m) => (
          <option key={m.month0} value={m.month0} disabled={m.future}>{m.label}</option>
        ))}
      </Select>
    </div>
  );
}
