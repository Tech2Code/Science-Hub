"use client";
import { useState, useEffect, useCallback } from "react";

export function useFetch<T>(url: string | null) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;
    let active = true;
    setLoading(true);
    fetch(url, { headers: { "x-no-loader": "1" } })
      .then((r) => r.json())
      .then((d: T) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  const mutate = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const d = await fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => r.json()) as T;
      setData(d);
    } catch {}
    setLoading(false);
  }, [url]);

  return { data, loading, mutate };
}

/** Always fetches fresh — no cache. force param kept for API compatibility. */
export async function fetchCached<T>(url: string, _force = false): Promise<T> {
  return fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => r.json()) as Promise<T>;
}

/** No-op — kept so existing call sites don't break. */
export function bustCache(_url: string) {}
