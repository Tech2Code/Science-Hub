// Shared client-side helpers for the Rate List new/edit forms — kept in one
// place so the two forms can't drift apart, mirroring purchaseBillForm.ts.

export interface RateListLineItem {
  key: string;
  name: string;
  brand: string;
  unit: string;
  isNetRate: boolean;
  discountPercent: string;
  listRate: string;
}

let keyCounter = 0;
export function makeRateListLineItemKey(): string {
  keyCounter += 1;
  return `new-${keyCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toNum(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return isNaN(n) ? 0 : n;
}

export function fmtCurrency(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** amount = listRate as-is for a net-rate row, otherwise listRate minus the discount. */
export function calcRateListItem(item: Pick<RateListLineItem, "isNetRate" | "discountPercent" | "listRate">): { amount: number } {
  const listRate = toNum(item.listRate);
  if (item.isNetRate) return { amount: listRate };
  const discountPercent = Math.min(100, Math.max(0, toNum(item.discountPercent)));
  return { amount: Math.round((listRate - (listRate * discountPercent) / 100) * 100) / 100 };
}

export const RATE_LIST_UNITS = [
  "Nos", "Pcs", "GM", "KG", "ML", "LTR", "Box", "Pack", "Set", "Dozen",
];

// Server-side counterpart to the client form above — normalizes and
// validates a raw items payload into rows ready for prisma.rateListItem
// create(), shared by the create and edit routes so they can't drift.
export interface RateListItemInput {
  name?: string;
  brand?: string;
  unit?: string;
  isNetRate?: boolean;
  discountPercent?: number | string;
  listRate?: number | string;
}

export interface BuiltRateListItem {
  serialNo: number;
  name: string;
  brand: string | null;
  unit: string;
  isNetRate: boolean;
  discountPercent: number;
  listRate: number;
  amount: number;
}

export function validateAndBuildRateListItems(items: unknown): { error: string } | { items: BuiltRateListItem[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "At least one item is required" };
  }
  const built: BuiltRateListItem[] = [];
  for (const [idx, raw] of (items as RateListItemInput[]).entries()) {
    const name = (raw.name ?? "").trim();
    const brand = (raw.brand ?? "").trim();
    const unit = (raw.unit ?? "").trim();
    const listRate = parseFloat(String(raw.listRate));
    if (!name) return { error: "Every item must have a name" };
    if (name.length < 2) return { error: "Item name must be at least 2 characters" };
    if (name.length > 200) return { error: "Item name is too long (max 200 characters)" };
    if (!unit) return { error: "Every item must have a unit" };
    if (unit.length > 50) return { error: "Item unit is too long (max 50 characters)" };
    if (brand.length > 100) return { error: "Item brand is too long (max 100 characters)" };
    if (!(listRate >= 0)) return { error: "Every item's list rate must be 0 or more" };
    const isNetRate = Boolean(raw.isNetRate);
    const discountPercent = isNetRate ? 0 : Math.min(100, Math.max(0, parseFloat(String(raw.discountPercent ?? 0)) || 0));
    const amount = isNetRate ? listRate : Math.round((listRate - (listRate * discountPercent) / 100) * 100) / 100;
    built.push({ serialNo: idx + 1, name, brand: brand || null, unit, isNetRate, discountPercent, listRate, amount });
  }
  return { items: built };
}
