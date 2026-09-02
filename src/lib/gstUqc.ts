// GST UQC (Unit Quantity Code) master list, from the GST Returns Offline Tool's own
// Excel Workbook Template V2.2 (hidden "master" sheet, "UQC" column) — the exact set
// the tool's HSN summary UQC field accepts on CSV import.
export const GST_UQC_CODES = [
  "BAG-BAGS", "BAL-BALE", "BDL-BUNDLES", "BKL-BUCKLES", "BOU-BILLION OF UNITS", "BOX-BOX",
  "BTL-BOTTLES", "BUN-BUNCHES", "CAN-CANS", "CBM-CUBIC METERS", "CCM-CUBIC CENTIMETERS",
  "CMS-CENTIMETERS", "CTN-CARTONS", "DOZ-DOZENS", "DRM-DRUMS", "GGK-GREAT GROSS", "GMS-GRAMMES",
  "GRS-GROSS", "GYD-GROSS YARDS", "KGS-KILOGRAMS", "KLR-KILOLITRE", "KME-KILOMETRE", "LTR-LITRES",
  "MLT-MILILITRE", "MTR-METERS", "MTS-METRIC TON", "NOS-NUMBERS", "PAC-PACKS", "PCS-PIECES",
  "PRS-PAIRS", "QTL-QUINTAL", "ROL-ROLLS", "SET-SETS", "SQF-SQUARE FEET", "SQM-SQUARE METERS",
  "SQY-SQUARE YARDS", "TBS-TABLETS", "TGM-TEN GROSS", "THD-THOUSANDS", "TON-TONNES", "TUB-TUBES",
  "UGS-US GALLONS", "UNT-UNITS", "YDS-YARDS", "OTH-OTHERS",
] as const;

const FALLBACK_UQC = "OTH-OTHERS";

// Best-effort mapping from this app's free-text product/rate-list unit strings (Nos, Kg,
// 500 GM, Ltr, ...) to the fixed GST UQC vocabulary above — product units here are never
// required to be a UQC code (see UnitCombo), so this is a lossy guess, not a real link.
const UNIT_ALIASES: Record<string, string> = {
  nos: "NOS-NUMBERS", no: "NOS-NUMBERS", number: "NOS-NUMBERS", numbers: "NOS-NUMBERS", pc: "PCS-PIECES",
  pcs: "PCS-PIECES", piece: "PCS-PIECES", pieces: "PCS-PIECES", unit: "UNT-UNITS", units: "UNT-UNITS",
  kg: "KGS-KILOGRAMS", kgs: "KGS-KILOGRAMS", kilogram: "KGS-KILOGRAMS", kilograms: "KGS-KILOGRAMS",
  gm: "GMS-GRAMMES", gms: "GMS-GRAMMES", g: "GMS-GRAMMES", gram: "GMS-GRAMMES", grams: "GMS-GRAMMES",
  ltr: "LTR-LITRES", ltrs: "LTR-LITRES", litre: "LTR-LITRES", litres: "LTR-LITRES", liter: "LTR-LITRES",
  liters: "LTR-LITRES", l: "LTR-LITRES", ml: "MLT-MILILITRE", mltr: "MLT-MILILITRE",
  mtr: "MTR-METERS", mtrs: "MTR-METERS", meter: "MTR-METERS", meters: "MTR-METERS", metre: "MTR-METERS",
  metres: "MTR-METERS", m: "MTR-METERS", cm: "CMS-CENTIMETERS", cms: "CMS-CENTIMETERS",
  km: "KME-KILOMETRE", box: "BOX-BOX", boxes: "BOX-BOX", ctn: "CTN-CARTONS", carton: "CTN-CARTONS",
  cartons: "CTN-CARTONS", pkt: "PAC-PACKS", pkts: "PAC-PACKS", pack: "PAC-PACKS", packs: "PAC-PACKS",
  packet: "PAC-PACKS", packets: "PAC-PACKS", bag: "BAG-BAGS", bags: "BAG-BAGS", btl: "BTL-BOTTLES",
  bottle: "BTL-BOTTLES", bottles: "BTL-BOTTLES", set: "SET-SETS", sets: "SET-SETS", pair: "PRS-PAIRS",
  pairs: "PRS-PAIRS", prs: "PRS-PAIRS", dozen: "DOZ-DOZENS", dozens: "DOZ-DOZENS", doz: "DOZ-DOZENS",
  roll: "ROL-ROLLS", rolls: "ROL-ROLLS", rol: "ROL-ROLLS", drum: "DRM-DRUMS", drums: "DRM-DRUMS",
  tube: "TUB-TUBES", tubes: "TUB-TUBES", tablet: "TBS-TABLETS", tablets: "TBS-TABLETS",
  tab: "TBS-TABLETS", tabs: "TBS-TABLETS", bundle: "BDL-BUNDLES", bundles: "BDL-BUNDLES",
  bdl: "BDL-BUNDLES", ton: "TON-TONNES", tonne: "TON-TONNES", tonnes: "TON-TONNES",
  yard: "YDS-YARDS", yards: "YDS-YARDS", yds: "YDS-YARDS", quintal: "QTL-QUINTAL", qtl: "QTL-QUINTAL",
};

export interface UqcMatch {
  code: string;
  matched: boolean;
}

// A raw unit like "500 GM" or "1 LTR" carries a size prefix the UQC vocabulary has no room
// for — strip a leading number before matching so the unit *type* still resolves.
export function mapUnitToUqc(unit: string): UqcMatch {
  const cleaned = unit.trim().toLowerCase().replace(/^[\d.]+\s*/, "").replace(/[.\s]+$/, "");
  const code = UNIT_ALIASES[cleaned];
  return code ? { code, matched: true } : { code: FALLBACK_UQC, matched: false };
}
