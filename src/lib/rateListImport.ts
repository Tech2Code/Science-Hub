// Shared bulk-import parsing for Rate List items — used by both the client-side paste flow and the
// server-side /api/rate-lists/parse-import route (ExcelJS-reduced .xlsx/.csv rows).

export interface ParsedRateListRow {
  name: string;
  brand: string;
  unit: string;
  isNetRate: boolean;
  discountPercent: string;
  listRate: string;
}

export interface ParsedRateListResult {
  items: ParsedRateListRow[];
  skipped: number;
}

type ColumnKey = "serial" | "name" | "brand" | "unit" | "discount" | "listRate" | "amount";

// Order matters — first match wins, so "List Rate" is tried before the looser "amount"/"rate" catch-alls.
const COLUMN_PATTERNS: { key: ColumnKey; pattern: RegExp }[] = [
  { key: "serial", pattern: /^(s\.?\s*no\.?|sr\.?\s*no\.?|#)$/i },
  { key: "listRate", pattern: /list\s*rate|^rate$|^price$/i },
  { key: "amount", pattern: /amount/i },
  { key: "name", pattern: /name|item|chemical|product|description/i },
  { key: "brand", pattern: /brand/i },
  { key: "unit", pattern: /unit/i },
  { key: "discount", pattern: /discount/i },
];

function detectColumns(headerRow: string[]): Partial<Record<ColumnKey, number>> {
  const map: Partial<Record<ColumnKey, number>> = {};
  headerRow.forEach((cell, idx) => {
    const trimmed = cell.trim();
    if (!trimmed) return;
    for (const { key, pattern } of COLUMN_PATTERNS) {
      if (!(key in map) && pattern.test(trimmed)) { map[key] = idx; break; }
    }
  });
  return map;
}

function parseDiscountCell(raw: string): { isNetRate: boolean; discountPercent: string } {
  const t = raw.trim();
  if (!t || /net\s*rate/i.test(t)) return { isNetRate: true, discountPercent: "0" };
  const num = parseFloat(t.replace(/%/g, ""));
  return { isNetRate: false, discountPercent: isNaN(num) ? "0" : String(Math.min(100, Math.max(0, num))) };
}

/** Splits a CSV line respecting quoted fields, so a quoted thousands-separator comma (e.g. `"1,902.00"`) isn't mistaken for a delimiter. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

const cellAt = (row: string[], idx: number | undefined): string => (idx !== undefined ? (row[idx] ?? "").trim() : "");

/** Parses a rows/columns grid into Rate List items, detecting a header by column-name matching or
 *  falling back to a positional guess (either this app's item order or a supplier's printed-table shape). */
export function parseRateListRows(rows: string[][]): ParsedRateListResult {
  if (rows.length === 0) return { items: [], skipped: 0 };

  let dataRows = rows;
  let cols = detectColumns(rows[0]);
  const looksLikeHeader = Object.keys(cols).length >= 2;
  if (looksLikeHeader) {
    dataRows = rows.slice(1);
  } else {
    const width = rows[0].length;
    if (width >= 7) cols = { serial: 0, name: 1, brand: 2, unit: 3, discount: 4, listRate: 5, amount: 6 };
    else if (width >= 5) cols = { name: 0, brand: 1, unit: 2, discount: 3, listRate: 4 };
    else if (width >= 3) cols = { name: 0, unit: 1, listRate: 2 };
    else cols = { name: 0, listRate: 1 };
  }

  const items: ParsedRateListRow[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (row.every((c) => !c.trim())) continue;
    const name = cellAt(row, cols.name);
    const listRate = cellAt(row, cols.listRate).replace(/[^\d.]/g, "");
    if (!name || !listRate) { skipped++; continue; }
    const { isNetRate, discountPercent } = cols.discount !== undefined ? parseDiscountCell(cellAt(row, cols.discount)) : { isNetRate: false, discountPercent: "0" };
    items.push({
      name,
      brand: cellAt(row, cols.brand),
      unit: cellAt(row, cols.unit) || "Nos",
      isNetRate,
      discountPercent,
      listRate,
    });
  }
  return { items, skipped };
}

/** Excel copy places a tab between columns — falls back to comma-split for a plain CSV snippet pasted instead of a spreadsheet range. */
export function parsePastedRateListText(text: string): ParsedRateListResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((line) => (line.includes("\t") ? line.split("\t") : parseCsvLine(line)));
  return parseRateListRows(rows);
}
