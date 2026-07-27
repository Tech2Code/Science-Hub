// Whether a sale is "inter-state" (IGST) or "intra-state" (CGST+SGST) is a
// GST-law fact derived from comparing the invoice's place of supply to the
// seller's own registered state — it should never be a value the client
// simply asserts. Previously the invoice create/edit routes trusted a
// client-supplied `isInterState` boolean as-is (the browser computed it the
// same way, so in normal use the two never disagreed — but nothing stopped
// a client from sending a mismatched pair). This derives it independently
// server-side from the business's own configured state.
export function deriveIsInterState(placeOfSupply: string, businessState: string): boolean | null {
  const supply = placeOfSupply.trim().toLowerCase();
  const home = businessState.trim().toLowerCase();
  // Business state isn't configured yet (e.g. Settings never filled in) —
  // there is nothing to compare against, so we can't derive a trustworthy
  // answer. Returning null tells the caller to fall back to whatever was
  // supplied rather than silently forcing a value that might be wrong.
  if (!home) return null;
  if (!supply) return null;
  return supply !== home;
}
