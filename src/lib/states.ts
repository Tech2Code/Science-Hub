export const INDIA_STATES = [
  "Delhi","Haryana","Uttar Pradesh"
];

// Full list, used by the customer form's own State dropdown (unrelated to the
// invoice place-of-supply list above, which is deliberately restricted).
export const INDIA_STATES_FULL = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Delhi","Jammu and Kashmir","Ladakh",
  "Lakshadweep","Puducherry",
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
