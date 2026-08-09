// Full India state list, used by every State dropdown (customer/vendor forms,
// invoice/purchase-bill place-of-supply). Delhi/Haryana/Uttar Pradesh (the NCR
// states, most of this business's customers) are pinned first; everything
// else follows alphabetically.
export const INDIA_STATES_FULL = [
  "Delhi","Haryana","Uttar Pradesh",
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chandigarh","Chhattisgarh","Goa","Gujarat","Himachal Pradesh","Jammu and Kashmir",
  "Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra",
  "Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttarakhand","West Bengal",
];

// The public pincode-lookup API (and some address sources) return a handful
// of state names that don't exactly match INDIA_STATES_FULL's entries — old
// names, alternate spellings, or "NCT of X" forms. Only used to match an
// auto-filled value against the form's own State dropdown; an unmatched
// name is left for the user to pick manually rather than silently guessed.
const STATE_ALIASES: Record<string, string> = {
  "orissa": "Odisha",
  "pondicherry": "Puducherry",
  "uttaranchal": "Uttarakhand",
  "nct of delhi": "Delhi",
  "delhi (nct)": "Delhi",
};

export function normalizeStateName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const exact = INDIA_STATES_FULL.find((s) => s.toLowerCase() === lower);
  if (exact) return exact;
  const alias = STATE_ALIASES[lower];
  if (alias) return alias;
  return null;
}
