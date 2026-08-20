import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireWriteAccess } from "@/lib/apiAuth";
import { parseProductRows, parseCsvLine } from "@/lib/productImport";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — a product catalog sheet is a few hundred rows at most

// Bulk-import for the Products list — lets a user drop in a supplier's
// existing .xlsx/.csv product sheet instead of adding items one by one.
// Parsing only (no DB write here); the client reviews/edits the returned
// rows before submitting each one through the normal POST /api/products
// flow, so every validation rule a manually-added product goes through
// still applies to an imported one.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 5MB)" }, { status: 413 });

    const lowerName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    let rows: string[][] = [];

    try {
      if (lowerName.endsWith(".csv")) {
        const text = Buffer.from(arrayBuffer).toString("utf-8");
        rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).map(parseCsvLine);
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) return NextResponse.json({ error: "No worksheet found in the file" }, { status: 400 });
        sheet.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => { cells.push(cell.text ?? ""); });
          rows.push(cells);
        });
      }
    } catch {
      return NextResponse.json({ error: "Could not read the file — make sure it's a valid .xlsx or .csv file." }, { status: 400 });
    }

    const { items, skipped } = parseProductRows(rows);
    if (items.length === 0) {
      return NextResponse.json({ error: "No usable rows found. Each row needs at least a name and a price." }, { status: 400 });
    }

    return NextResponse.json({ items, skipped });
  } catch (error) {
    console.error("POST /api/products/parse-import error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
