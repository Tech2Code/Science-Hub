import { useState } from "react";

// Tracks whether a form's current values differ from the last "clean"
// snapshot (usually right after the data finishes loading, or right after a
// successful save) — lets a Save button stay disabled until something has
// actually changed, instead of always being submittable.
//
// Usage:
//   const values = { name, email, ... };
//   const { isDirty, markClean } = useDirty(values);
//   // right after data loads (inside the same fetch callback, using the
//   // freshly-fetched values rather than state — state updates from the
//   // same callback haven't committed yet, so `values` above is stale here):
//   markClean({ name: data.name, email: data.email, ... });
//   <Button disabled={saving || !isDirty}>Save</Button>
export function useDirty<T>(values: T) {
  const [baseline, setBaseline] = useState<string | null>(null);

  const snapshot = JSON.stringify(values);
  const isDirty = baseline !== null && baseline !== snapshot;

  function markClean(explicitValues?: T) {
    setBaseline(JSON.stringify(explicitValues !== undefined ? explicitValues : values));
  }

  return { isDirty, markClean };
}
