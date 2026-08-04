import { normalizeStateName } from "@/lib/states";

export interface PincodeLookupResult {
  city: string;
  /** Only present when it matches an entry in INDIA_STATES_FULL — for fields backed by that dropdown. */
  state: string | null;
  /** The postal API's own state string, unmatched — for free-text state fields (e.g. Settings). */
  stateRaw: string;
}

// Looks up a 6-digit pincode via our own server-side proxy (/api/pincode-lookup)
// and returns city/state, or null if not found / the request failed. Callers
// decide whether/how to apply the result (e.g. only filling blank fields).
export async function lookupPincode(pincode: string): Promise<PincodeLookupResult | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const res = await fetch(`/api/pincode-lookup/${pincode}`, { headers: { "x-no-loader": "1" } });
    if (!res.ok) return null;
    const data = await res.json();
    const stateRaw = data.state ?? "";
    return { city: data.city ?? "", state: normalizeStateName(stateRaw), stateRaw };
  } catch {
    return null;
  }
}
