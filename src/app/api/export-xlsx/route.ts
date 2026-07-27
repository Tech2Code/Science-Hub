import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { buildXlsxBuffer } from "@/lib/xlsxExport";

const MAX_ROWS = 20000;
const MAX_COLS = 50;

// Generic "turn this already-fetched table into a downloadable .xlsx" endpoint —
// shared by every list-page export button (Credit Notes, Sales/Purchase
// Reports) so each one doesn't need its own report-shaped route. The caller
// already has the rows (filtered/sorted exactly as shown on screen); this
// only handles the ExcelJS part, which is too heavy to bundle client-side.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { filename, sheetName, headers, rows } = body as {
      filename?: string; sheetName?: string; headers?: unknown; rows?: unknown;
    };

    if (!Array.isArray(headers) || headers.some((h) => typeof h !== "string")) {
      return NextResponse.json({ error: "headers must be an array of strings" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.some((r) => !Array.isArray(r))) {
      return NextResponse.json({ error: "rows must be an array of arrays" }, { status: 400 });
    }
    if (headers.length === 0 || headers.length > MAX_COLS) {
      return NextResponse.json({ error: `headers must have 1-${MAX_COLS} columns` }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Cannot export more than ${MAX_ROWS} rows at once` }, { status: 400 });
    }
    for (const row of rows as unknown[][]) {
      if (row.length !== headers.length || row.some((v) => typeof v !== "string" && typeof v !== "number")) {
        return NextResponse.json({ error: "Each row must match the header column count and contain only strings/numbers" }, { status: 400 });
      }
    }

    const buffer = await buildXlsxBuffer(
      sheetName?.trim() || "Sheet1",
      headers as string[],
      rows as (string | number)[][]
    );

    const safeName = (filename?.trim() || "export").replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName.endsWith(".xlsx") ? safeName : `${safeName}.xlsx`}"`,
      },
    });
  } catch (error) {
    console.error("POST /api/export-xlsx error:", error);
    return NextResponse.json({ error: "Failed to generate Excel file" }, { status: 500 });
  }
}
