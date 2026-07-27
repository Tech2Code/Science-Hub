import { NextResponse } from "next/server";
import { getProductStats } from "@/lib/db";
import { requireSession } from "@/lib/apiAuth";

// Out-of-stock/low-stock/total counts for the Products list page's stock
// filter tabs — kept separate from the paginated list route since these
// counts must reflect the whole catalog regardless of which tab/page is active.
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const stats = await getProductStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/products/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch product stats" }, { status: 500 });
  }
}
