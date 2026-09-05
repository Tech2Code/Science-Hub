// GST state/UT codes as published in the GST Returns Offline Tool's own master list
// (Excel Workbook Template V2.2, hidden "master" sheet, "POS" column) — the exact
// "NN-State Name" strings the tool's Place Of Supply field expects on CSV import.
// Keyed by src/lib/states.ts's INDIA_STATES_FULL spelling so callers can look up by
// whatever state string the app already normalized a customer/invoice to.
export const GST_STATE_CODES = {
  "Jammu and Kashmir": "01-Jammu & Kashmir",
  "Himachal Pradesh": "02-Himachal Pradesh",
  "Punjab": "03-Punjab",
  "Chandigarh": "04-Chandigarh",
  "Uttarakhand": "05-Uttarakhand",
  "Haryana": "06-Haryana",
  "Delhi": "07-Delhi",
  "Rajasthan": "08-Rajasthan",
  "Uttar Pradesh": "09-Uttar Pradesh",
  "Bihar": "10-Bihar",
  "Sikkim": "11-Sikkim",
  "Arunachal Pradesh": "12-Arunachal Pradesh",
  "Nagaland": "13-Nagaland",
  "Manipur": "14-Manipur",
  "Mizoram": "15-Mizoram",
  "Tripura": "16-Tripura",
  "Meghalaya": "17-Meghalaya",
  "Assam": "18-Assam",
  "West Bengal": "19-West Bengal",
  "Jharkhand": "20-Jharkhand",
  "Odisha": "21-Odisha",
  "Chhattisgarh": "22-Chhattisgarh",
  "Madhya Pradesh": "23-Madhya Pradesh",
  "Gujarat": "24-Gujarat",
  "Maharashtra": "27-Maharashtra",
  "Karnataka": "29-Karnataka",
  "Goa": "30-Goa",
  "Lakshadweep": "31-Lakshdweep", // matches the offline tool's own (misspelled) master list entry, not the dictionary spelling
  "Kerala": "32-Kerala",
  "Tamil Nadu": "33-Tamil Nadu",
  "Puducherry": "34-Puducherry",
  "Andaman and Nicobar Islands": "35-Andaman & Nicobar Islands",
  "Telangana": "36-Telangana",
  "Andhra Pradesh": "37-Andhra Pradesh",
  "Ladakh": "38-Ladakh",
} as const;

// Returns the exact GSTN "NN-State Name" label for a given state string, or null if
// it doesn't resolve — callers should surface that as a validation issue rather than
// export a row the offline tool's Place Of Supply dropdown will reject.
export function getGstPosLabel(stateName: string): string | null {
  // GST_STATE_CODES is typed with its exact literal keys/values (`as const`) so a direct access
  // like GST_STATE_CODES.Delhi is typo-checked at compile time; this one lookup site is
  // necessarily dynamic (an arbitrary customer/invoice state string), so it's cast narrowly here
  // rather than widening the table's own declared type back to Record<string, string>.
  return (GST_STATE_CODES as Record<string, string>)[stateName.trim()] ?? null;
}
