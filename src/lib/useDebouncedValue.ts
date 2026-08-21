"use client";

import { useEffect, useState } from "react";

// Delays reflecting a fast-changing value until it stops changing for `delayMs` — avoids firing a request per keystroke on server-driven filters.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
