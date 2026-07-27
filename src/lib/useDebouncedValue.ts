"use client";

import { useEffect, useState } from "react";

// Delays reflecting a fast-changing value (e.g. a search input) until it's
// stopped changing for `delayMs` — used to avoid firing a network request on
// every keystroke once a filter drives a server-side query instead of an
// in-memory array filter.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
