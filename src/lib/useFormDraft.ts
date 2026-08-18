"use client";

import { useEffect, useRef } from "react";

const DRAFT_PREFIX = "sciencehub_draft:";

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
  const serialized = JSON.stringify(values);

  useEffect(() => {
    if (skip) return;
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
    return JSON.parse(raw) as StoredDraft<T>;
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
