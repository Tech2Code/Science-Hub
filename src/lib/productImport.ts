// Shared bulk-import parsing for Products — mirrors src/lib/rateListImport.ts
// so the client-side "Paste from Excel" flow (a tab-separated clipboard
// paste needs no server round-trip) and the server-side
// /api/products/parse-import route (an uploaded .xlsx/.csv, where ExcelJS
// has already reduced the sheet to plain string rows) share one parser.

export interface ParsedProductRow {
  name: string;
  sku: string;
  hsn: string;
  unit: string;
  price: string;
  purchasePrice: string;
  gstRate: string;
  stock: string;
  minStock: string;
  brand: string;
  category: string;
}

type ColumnKey = "name" | "sku" | "hsn" | "unit" | "purchasePrice" | "price" | "gstRate" | "stock" | "minStock" | "brand" | "category";

// Order matters — checked top to bottom per header cell, first match wins,
// so "Purchase Price" is tried before the looser generic "price" pattern
// would otherwise also match it, and "Min Stock" before plain "Stock".
const COLUMN_PATTERNS: { key: ColumnKey; pattern: RegExp }[] = [
  { key: "sku", pattern: /^sku$|item\s*code|product\s*code/i },
  { key: "hsn", pattern: /hsn/i },
  { key: "purchasePrice", pattern: /purchase\s*price|cost\s*price|^cost$/i },
  { key: "gstRate", pattern: /gst|tax\s*rate/i },
  { key: "minStock", pattern: /min(imum)?\s*stock|reorder/i },
  { key: "stock", pattern: /stock|qty|quantity/i },
  { key: "unit", pattern: /unit/i },
  { key: "brand", pattern: /brand/i },
  { key: "category", pattern: /category/i },
  { key: "price", pattern: /price|rate/i },
  { key: "name", pattern: /name|item|product|description/i },
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

/**
 * Splits one CSV line into fields, respecting double-quoted fields so a
 * quoted thousands-separator comma (e.g. a price exported as `"1,902.00"`)
 * isn't mistaken for a column delimiter — a plain `line.split(",")` breaks
 * on every comma regardless of quoting and silently truncates such values
 * to the digits before the first comma.
 */
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
const numCellAt = (row: string[], idx: number | undefined): string => cellAt(row, idx).replace(/[^\d.]/g, "");

/**
 * Parses a rectangular grid of string cells (already split into rows/columns
 * by the caller) into Product rows. Recognizes a header row by column-name
 * matching (Name/SKU/HSN/Unit/Price/Purchase Price/GST/Stock/Min Stock/
 * Brand/Category, in any order, any casing); falls back to a positional
 * guess by column count when no header is detected.
 */
export function parseProductRows(rows: string[][]): { items: ParsedProductRow[]; skipped: number } {
  if (rows.length === 0) return { items: [], skipped: 0 };

  let dataRows = rows;
  let cols = detectColumns(rows[0]);
  const looksLikeHeader = Object.keys(cols).length >= 2;
  if (looksLikeHeader) {
    dataRows = rows.slice(1);
  } else {
    const width = rows[0].length;
    if (width >= 9) cols = { name: 0, sku: 1, hsn: 2, unit: 3, price: 4, purchasePrice: 5, gstRate: 6, stock: 7, minStock: 8 };
    else if (width >= 6) cols = { name: 0, unit: 1, price: 2, gstRate: 3, stock: 4, minStock: 5 };
    else if (width >= 4) cols = { name: 0, unit: 1, price: 2, stock: 3 };
    else if (width >= 2) cols = { name: 0, price: 1 };
    else cols = { name: 0 };
  }

  const items: ParsedProductRow[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (row.every((c) => !c.trim())) continue;
    const name = cellAt(row, cols.name);
    const price = numCellAt(row, cols.price);
    if (!name || !price) { skipped++; continue; }
    items.push({
      name,
      sku: cellAt(row, cols.sku),
      hsn: cellAt(row, cols.hsn),
      unit: cellAt(row, cols.unit) || "Nos",
      price,
      purchasePrice: numCellAt(row, cols.purchasePrice),
      gstRate: numCellAt(row, cols.gstRate) || "18",
      stock: numCellAt(row, cols.stock) || "0",
      minStock: numCellAt(row, cols.minStock) || "5",
      brand: cellAt(row, cols.brand),
      category: cellAt(row, cols.category),
    });
  }
  return { items, skipped };
}

/** Excel copy places a tab between columns — falls back to comma-split for a plain CSV snippet pasted instead of a spreadsheet range. */
export function parsePastedProductText(text: string): { items: ParsedProductRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((line) => (line.includes("\t") ? line.split("\t") : parseCsvLine(line)));
  return parseProductRows(rows);
}
