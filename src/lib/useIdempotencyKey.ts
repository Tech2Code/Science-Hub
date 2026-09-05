"use client";
import { useRef } from "react";

// A stable, client-generated key minted once per form/dialog mount and sent with a mutating
// POST so a retried/duplicated submission (network timeout, double-tap that slips past the
// saving-flag guard) is recognized server-side as the same submission instead of creating a
// second row. Call `renew()` after a successful submit if the same form instance stays mounted
// and could legitimately submit again (e.g. a payment dialog reused for a second payment) —
// otherwise the next submit would be silently treated as a duplicate of the first.
export function useIdempotencyKey(): { key: () => string; renew: () => void } {
  const ref = useRef(crypto.randomUUID());
  function renew() {
    ref.current = crypto.randomUUID();
  }
  return { key: () => ref.current, renew };
}
