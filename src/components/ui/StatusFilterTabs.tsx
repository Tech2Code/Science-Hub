"use client";

import { animateSection } from "@/lib/animateSection";

interface StatusFilterTabsProps<T extends string> {
  sectionIndex: number;
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
}

// Status filter tab row (All/unpaid/partial/paid/…) shown atop list pages —
// shared by the Invoices and Purchase Bills list pages so they can't drift apart.
export function StatusFilterTabs<T extends string>({ sectionIndex, tabs, value, onChange }: StatusFilterTabsProps<T>) {
  return (
    <div {...animateSection(sectionIndex, "filter-tabs-row")}>
      <div className="filter-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={["filter-tab", value === tab ? "filter-tab-active" : ""].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
