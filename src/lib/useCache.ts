"use client";
import { useState, useEffect, useCallback } from "react";

// A non-2xx response still parses as JSON, so plain .json() wouldn't notice failure — throw here so callers' .catch()/error-state handling fires.
async function parseOrThrow<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : `Request failed (${r.status})`;
    throw new Error(message);
  }
  return body as T;
}

// Shared in-memory cache keyed by URL + subscribers, so every useFetch(url) for the same URL updates in lockstep (instant revisit, cross-page mutation propagation).
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

function publish<T>(url: string, data: T) {
  cache.set(url, data);
  listeners.get(url)?.forEach((fn) => fn(data));
}

export function useFetch<T>(url: string | null) {
  const [data, setData]       = useState<T | null>(() => (url && cache.has(url) ? (cache.get(url) as T) : null));
  const [loading, setLoading] = useState(() => !(url && cache.has(url)));
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!url) return;
    let active = true;

    const onUpdate = (d: unknown) => { if (active) setData(d as T); };
    if (!listeners.has(url)) listeners.set(url, new Set());
    listeners.get(url)!.add(onUpdate);

    // Shows cached data immediately (no skeleton); trusted until explicitly busted, so an unchanged remount triggers no network request.
    const hasCache = cache.has(url);
    if (hasCache) {
      setData(cache.get(url) as T); // eslint-disable-line react-hooks/set-state-in-effect -- seeds from the module-level cache synchronously so the first paint shows it, not a skeleton
      setLoading(false);
      setError(false);
      return () => { active = false; listeners.get(url)?.delete(onUpdate); };
    }

    setLoading(true);
    setError(false);

    fetch(url, { headers: { "x-no-loader": "1" } })
      .then((r) => parseOrThrow<T>(r))
      .then((d) => { if (active) { publish(url, d); setLoading(false); } })
      .catch(() => { if (active) { setLoading(false); setError(true); } });

    return () => { active = false; listeners.get(url)?.delete(onUpdate); };
  }, [url]);

  const mutate = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const d = await fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => parseOrThrow<T>(r));
      publish(url, d);
      setError(false);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [url]);

  // Update this URL's cached data from an already-known value instead of refetching; every mounted watcher updates in the same tick.
  const patchData = useCallback((updater: (prev: T | null) => T) => {
    if (!url) return;
    publish(url, updater((cache.has(url) ? cache.get(url) : null) as T | null));
  }, [url]);

  return { data, loading, error, mutate, patchData };
}

/** Always fetches fresh, and updates the shared cache other useFetch(url) callers read from. */
export async function fetchCached<T>(url: string, _force = false): Promise<T> {
  const d = await fetch(url, { headers: { "x-no-loader": "1" } }).then((r) => parseOrThrow<T>(r));
  publish(url, d);
  return d;
}

/** Invalidate a cached URL so the next mount does a full fetch instead of showing stale data. */
export function bustCache(url: string) {
  cache.delete(url);
}

// Invalidates every cached URL starting with `prefix` — plain bustCache() only matches the bare param-less URL
// and misses parameterized list variants. Also matches sibling sub-routes (e.g. bustCachePrefix("/api/invoices")
// busts "/api/invoices/stats" too) so callers don't have to separately remember every companion endpoint.
export function bustCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(`${prefix}?`) || key.startsWith(`${prefix}/`)) cache.delete(key);
  }
}

/** Directly patch a cached URL's data from outside a component (e.g. a "new"/"edit" page updating the list it's about to navigate back to). */
export function patchCache<T>(url: string, updater: (prev: T | null) => T) {
  publish(url, updater((cache.has(url) ? cache.get(url) : null) as T | null));
}

/** Like patchCache, but a genuine no-op if this URL was never cached (e.g. a panel nobody has opened yet) — avoids seeding a cache entry from a partial optimistic update; the next real open just does a normal fresh fetch instead. */
export function patchCacheIfPresent<T>(url: string, updater: (prev: T) => T) {
  if (!cache.has(url)) return;
  publish(url, updater(cache.get(url) as T));
}
