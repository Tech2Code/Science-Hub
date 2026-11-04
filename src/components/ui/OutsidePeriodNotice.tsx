"use client";

import { useState } from "react";
import { InfoBanner } from "./InfoBanner";

// Shown on a list that is scoped to one financial year when money is still unpaid on documents from OTHER
// years — so scoping the list to the current FY can never quietly hide something the business is owed / owes.
export function OutsidePeriodNotice({ count, amount, noun }: { count: number; amount: number; noun: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || count <= 0) return null;
  const money = `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return (
    <InfoBanner
      message={<>{money} is still unpaid on {count} {noun}{count === 1 ? "" : "s"} from other financial years. Change the Financial year filter to see {count === 1 ? "it" : "them"}.</>}
      onDismiss={() => setHidden(true)}
    />
  );
}
