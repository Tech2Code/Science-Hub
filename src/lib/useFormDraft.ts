"use client";

import { useEffect, useRef } from "react";

const DRAFT_PREFIX = "sciencehub_draft:";
// A draft abandoned this long is treated as stale and discarded on next load, so localStorage
// doesn't accumulate orphaned drafts.
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  values: T;
  savedAt: number;
}

// Debounced localStorage autosave for long forms, so an accidental navigation mid-fill doesn't lose
// input (see loadFormDraft/clearFormDraft). `values` should be user-editable fields only, not UI state.
export function useFormDraft<T>(key: string, values: T, skip: boolean) {
  const storageKey = DRAFT_PREFIX + key;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Captures values at the moment autosaving turns on — without this, the first debounce tick
  // after skip flips false would resurrect a draft the user just dismissed/cleared.
  const baselineRef = useRef<string | null>(null);
  const serialized = JSON.stringify(values);

  useEffect(() => {
    if (skip) { baselineRef.current = null; return; }
    if (baselineRef.current === null) { baselineRef.current = serialized; return; }
    if (serialized === baselineRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const draft: StoredDraft<T> = { values, savedAt: Date.now() };
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // localStorage can throw in private-browsing/quota-exceeded cases — a
        // failed autosave should never break the form itself.
      }
    }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized already captures every field in `values`
  }, [serialized, skip, storageKey]);
}

// `onExpire` fires synchronously, with the about-to-be-discarded values, only when this call is the
// one that finds the draft too old and wipes it — never on a fresh draft, and never again once
// another call has already expired/removed it. Optional and additive: every existing caller that
// doesn't pass it keeps its exact current behavior. Exists because a draft can reference an external
// resource (e.g. an uploaded-but-unsaved file's blob URL) that this generic localStorage utility
// has no business knowing how to clean up itself — the caller does, and without this hook a stale
// draft's silent auto-purge had no way to tell the caller anything needed cleaning up at all.
export function loadFormDraft<T>(key: string, onExpire?: (staleValues: T) => void): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft<T>;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_PREFIX + key);
      onExpire?.(draft.values);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // ignore
  }
}
