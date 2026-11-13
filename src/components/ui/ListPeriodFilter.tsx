"use client";

import { PeriodFilter, type PeriodCountScope, type PeriodValue } from "@/components/dashboard/PeriodFilter";
import shared from "./ToolbarField.module.css";

// "Period" toolbar field for list pages: Financial Year first, then Month (Apr → Mar, future months disabled).
export function ListPeriodFilter({ value, onChange, label = "Period", countScope, statusFilter }: {
  value: PeriodValue;
  onChange: (p: PeriodValue) => void;
  label?: string;
  countScope?: PeriodCountScope;
  statusFilter?: string;
}) {
  return (
    <div className={shared.wrap}>
      <span className={shared.label}>{label}</span>
      <PeriodFilter value={value} onChange={onChange} countScope={countScope} statusFilter={statusFilter} />
    </div>
  );
}
