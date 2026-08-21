import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireWriteAccess } from "@/lib/apiAuth";
import { parseRateListRows, parseCsvLine } from "@/lib/rateListImport";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — a rate list sheet is a few hundred rows at most

// Parsing only, no DB write — the client merges returned rows into the items table so the user can still review/edit before saving.
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

    const { items, skipped } = parseRateListRows(rows);
    if (items.length === 0) {
      return NextResponse.json({ error: "No usable rows found. Each row needs at least a name and a list rate." }, { status: 400 });
    }

    return NextResponse.json({ items, skipped });
  } catch (error) {
    console.error("POST /api/rate-lists/parse-import error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
