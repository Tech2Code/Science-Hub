"use client";

import { useEffect, useRef } from "react";

const DRAFT_PREFIX = "sciencehub_draft:";
// A draft abandoned this long (never saved or dismissed — tab closed,
// navigated away without deciding) is treated as stale and discarded on next
// load rather than kept forever, so localStorage doesn't accumulate orphaned
// drafts for invoices/bills the user gave up on weeks ago.
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  values: T;
  savedAt: number;
}

// Debounced localStorage autosave for a long form (invoice/bill/rate-list
// create+edit) so an accidental sidebar-navigation click mid-fill doesn't
// lose everything the user already typed — see loadFormDraft() to restore on
// mount and clearFormDraft() to drop the draft once the form is submitted.
//
// `values` should be just the user-editable fields (not loading/UI-only
// state like dropdown-open flags), so a restored draft can be spread
// straight back onto individual setState calls.
export function useFormDraft<T>(key: string, values: T, skip: boolean) {
  const storageKey = DRAFT_PREFIX + key;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Captures the serialized values at the moment autosaving turns on (mount
  // finishes loading, or the draft-restore banner gets resolved) — without
  // this, the very first debounce tick after skip flips to false would
  // immediately re-write the current (often still-blank) state back to
  // localStorage, resurrecting a draft the user just dismissed/cleared.
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

export function loadFormDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredDraft<T>;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_PREFIX + key);
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
