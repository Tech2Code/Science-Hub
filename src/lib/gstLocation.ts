// Derives inter-state/intra-state server-side rather than trusting a client-supplied isInterState flag, since nothing stops a client from sending a mismatched pair.
export function deriveIsInterState(placeOfSupply: string, businessState: string): boolean | null {
  const supply = placeOfSupply.trim().toLowerCase();
  const home = businessState.trim().toLowerCase();
  // No business state configured — nothing to compare against; null tells the caller to fall back to the supplied value.
  if (!home) return null;
  if (!supply) return null;
  return supply !== home;
}
