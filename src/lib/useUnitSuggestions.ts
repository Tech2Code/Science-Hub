"use client";

import { useMemo } from "react";
import { useFetch } from "./useCache";

interface UnitsResponse {
  units: string[];
}

// Merges a form's static unit suggestion list with any custom unit already saved in the
// database (Product/Invoice-item/Purchase-Bill-item), so a unit typed once as free text
// (e.g. "500 GM") shows up as a one-click suggestion everywhere afterwards.
export function useUnitSuggestions(staticUnits: string[]): string[] {
  const { data } = useFetch<UnitsResponse>("/api/units");

  return useMemo(() => {
    const seen = new Set(staticUnits.map((u) => u.toLowerCase()));
    const extra = (data?.units ?? []).filter((u) => !seen.has(u.toLowerCase()));
    return extra.length ? [...staticUnits, ...extra] : staticUnits;
  }, [staticUnits, data]);
}
