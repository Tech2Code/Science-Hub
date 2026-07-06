"use client";
import { useState, useEffect, useCallback } from "react";

// A non-2xx response (401/404/500…) still has a JSON body (typically
// {error: "..."}), so a plain .then(r => r.json()) never notices the
// request failed — callers end up treating an error payload as real data
// and crash later on a missing field. Throwing here lets every consumer's
// existing .catch()/error-state handling actually fire.
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

// Shared in-memory cache keyed by URL, plus subscribers so every mounted
// useFetch(url) for the same URL updates in lockstep. This is what lets a
// page navigated-to a second time show its last-known data instantly
// (no loading skeleton) while quietly revalidating in the background, and
// what lets a mutation on one page (e.g. deleting a row) push an update
// into a list another component is already displaying.
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

    // Shows last-known cached data immediately on mount (no skeleton), ahead
    // of the background revalidation below.
    const hasCache = cache.has(url);
    if (hasCache) {
      setData(cache.get(url) as T); // eslint-disable-line react-hooks/set-state-in-effect -- seeds from the module-level cache synchronously so the first paint shows it, not a skeleton
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(false);

    fetch(url, { headers: { "x-no-loader": "1" } })
      .then((r) => parseOrThrow<T>(r))
      .then((d) => { if (active) { publish(url, d); setLoading(false); } })
      .catch(() => { if (active) { setLoading(false); if (!hasCache) setError(true); } });

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

  // Update this URL's data immediately from an already-known value (e.g. a
  // create/update endpoint's own response, or removing a row after a
  // successful delete) instead of waiting on a full refetch. Every mounted
  // component watching this URL — including ones on a different page that
  // haven't unmounted — updates in the same tick.
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

/** Directly patch a cached URL's data from outside a component (e.g. a "new"/"edit" page updating the list it's about to navigate back to). No-op if that URL was never cached. */
export function patchCache<T>(url: string, updater: (prev: T | null) => T) {
  publish(url, updater((cache.has(url) ? cache.get(url) : null) as T | null));
}
