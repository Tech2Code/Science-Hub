// Full India state list; Delhi/Haryana/Uttar Pradesh (most customers) pinned first, rest alphabetical.
export const INDIA_STATES_FULL = [
  "Delhi","Haryana","Uttar Pradesh",
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chandigarh","Chhattisgarh","Goa","Gujarat","Himachal Pradesh","Jammu and Kashmir",
  "Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra",
  "Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttarakhand","West Bengal",
];

// Maps state-name variants from external lookups (old names/spellings/"NCT of X") onto
// INDIA_STATES_FULL entries; an unmatched name is left for the user to pick manually.
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
