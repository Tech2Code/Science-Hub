"use client";

import { useRef, useState } from "react";
import { lookupPincode } from "@/lib/pincodeLookup";

export type PincodeLookupState = { status: "idle" | "loading" | "found" | "error"; label?: string };

// Shared by every pincode field in the app (customer/vendor forms, the
// invoice inline "custom customer" form, business settings address) so the
// request-race guard and status plumbing only exist once. `onResolved` is
// called with the looked-up city/state as soon as a 6-digit pincode
// successfully resolves — state is null when the postal API's state name
// didn't map onto INDIA_STATES_FULL (see normalizeStateName).
export function usePincodeAutofill(onResolved: (city: string, state: string | null, stateRaw: string) => void) {
  const [status, setStatus] = useState<PincodeLookupState>({ status: "idle" });
  // A monotonic counter rather than the pincode string itself — comparing by
  // value lets a request for "110001" resolve late and be mistaken for a
  // second, independent request for the same value typed after cycling
  // through another pincode in between. reset() also bumps this, so a modal
  // that's closed and reopened (which unmounts the fields but not this
  // hook's state, since it's owned by the parent component) can't have a
  // request from its previous open silently populate the freshly blank form.
  const requestIdRef = useRef(0);

  async function run(pincode: string) {
    const requestId = ++requestIdRef.current;
    setStatus({ status: "loading" });
    const result = await lookupPincode(pincode);
    if (requestIdRef.current !== requestId) return; // superseded by a newer request or a reset()
    if (!result) {
      setStatus({ status: "error", label: "Couldn't find this pincode — enter city/state manually." });
      return;
    }
    setStatus({ status: "found", label: [result.city, result.stateRaw].filter(Boolean).join(", ") });
    onResolved(result.city, result.state, result.stateRaw);
  }

  function reset() {
    requestIdRef.current++;
    setStatus({ status: "idle" });
  }

  return { status, run, reset };
}
