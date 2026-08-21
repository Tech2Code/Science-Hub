import { NextRequest, NextResponse } from "next/server";
import { getInvoiceStats } from "@/lib/db";
import { requireSession } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";

// Kept separate from the paginated list route, since a single page of rows can't produce a correct total.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");

    const stats = await getInvoiceStats({ status, dateRange });
    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/invoices/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice stats" }, { status: 500 });
  }
}
