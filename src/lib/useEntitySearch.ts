"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

// Debounced, cancellable server-side search for a picker/combobox (vendor, customer, product, ...) —
// replaces the old "prefetch every row with ?pageSize=5000, filter client-side per keystroke" pattern,
// which silently stops showing anything past the list route's own pageSize cap once an entity's real
// row count grows past it. Mirrors GlobalSearch.tsx's debounce+AbortController shape.
export function useEntitySearch<T>(endpoint: string, query: string, opts?: { pageSize?: number; enabled?: boolean }) {
  const pageSize = opts?.pageSize ?? 20;
  const enabled = opts?.enabled ?? true;
  const debounced = useDebouncedValue(query, 250);
  const [results, setResults] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Resets results when the caller toggles search off (e.g. a picker collapses once something is
    // selected) — a legitimate prop-driven external-state reset, not derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) { setResults([]); setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (debounced.trim()) params.set("search", debounced.trim());
    fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal, headers: { "x-no-loader": "1" } })
      .then((r) => r.json())
      .then((res: { data?: T[]; total?: number }) => {
        setResults(res.data ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((err) => { if (err?.name !== "AbortError") setResults([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, debounced, pageSize, enabled]);

  return { results, total, loading };
}
