"use client";

import { useRef, useState } from "react";
import { lookupPincode } from "@/lib/pincodeLookup";

export type PincodeLookupState = { status: "idle" | "loading" | "found" | "error"; label?: string };

// Shared pincode-autofill logic for every address form. `onResolved`'s state
// arg is null when the postal API's state name doesn't map onto INDIA_STATES_FULL.
export function usePincodeAutofill(onResolved: (city: string, state: string | null, stateRaw: string) => void) {
  const [status, setStatus] = useState<PincodeLookupState>({ status: "idle" });
  // Monotonic counter, not the pincode value, so a stale in-flight request (incl. across
  // a modal close/reopen via reset()) can't overwrite a newer one or a freshly blank form.
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
