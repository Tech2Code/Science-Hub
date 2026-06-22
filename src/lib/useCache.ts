"use client";
import { useState, useEffect, useCallback } from "react";

const TTL_MS = 0;

interface Entry<T> { data: T; at: number }
const store = new Map<string, Entry<unknown>>();

function fresh<T>(url: string): T | undefined {
  const e = store.get(url) as Entry<T> | undefined;
  if (!e) return undefined;
  return Date.now() - e.at < TTL_MS ? e.data : undefined;
}

function set<T>(url: string, data: T) {
  store.set(url, { data, at: Date.now() });
}

export function useFetch<T>(url: string | null) {
  const cached = url ? fresh<T>(url) : undefined;
  const [data, setData]       = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!url) return;
    const hit = fresh<T>(url);
    if (hit !== undefined) {
      setData(hit);
      setLoading(false);
      return; // still fresh — skip network
    }
    const headers = { "x-no-loader": "1" };
    setLoading(true);
    let active = true;
    fetch(url, { headers })
      .then((r) => r.json())
      .then((d: T) => {
        if (!active) return;
        set(url, d);
        setData(d);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  const mutate = useCallback(async () => {
    if (!url) return;
    store.delete(url);
    setLoading(true);
    try {
      const d = (await fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => r.json())) as T;
      set(url, d);
      setData(d);
    } catch {}
    setLoading(false);
  }, [url]);

  return { data, loading, mutate };
}

/** One-shot cached fetch for useEffect-based pages. Bypasses cache on force=true. */
export async function fetchCached<T>(url: string, force = false): Promise<T> {
  if (!force) {
    const hit = fresh<T>(url);
    if (hit !== undefined) return hit;
  } else {
    store.delete(url);
  }
  const d = await fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => r.json()) as T;
  set(url, d);
  return d;
}

export function bustCache(url: string) {
  store.delete(url);
}
