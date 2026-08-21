import { useState } from "react";

// Tracks dirty state vs. a "clean" baseline for Save-button gating.
// Call markClean() with the freshly-fetched data (not state) right after load, since state hasn't committed yet in the same callback.
export function useDirty<T>(values: T) {
  const [baseline, setBaseline] = useState<string | null>(null);

  const snapshot = JSON.stringify(values);
  const isDirty = baseline !== null && baseline !== snapshot;

  function markClean(explicitValues?: T) {
    setBaseline(JSON.stringify(explicitValues !== undefined ? explicitValues : values));
  }

  return { isDirty, markClean };
}
