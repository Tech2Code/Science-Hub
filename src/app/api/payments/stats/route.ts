import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";
import { buildPaymentWhere } from "@/lib/paymentQuery";

// Total collected across every payment matching the list route's own filters (search/month/year) —
// kept separate from the paginated list route since a single page of rows can no longer produce
// this sum. Reuses buildPaymentWhere so the header's "N payments · Total collected ₹X" agree.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSectionAccess("payments_received");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const where = buildPaymentWhere({ search, dateRange });
    const [agg, total] = await Promise.all([
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
      prisma.payment.count({ where }),
    ]);
    return NextResponse.json({ totalCollected: agg._sum.amount ?? 0, totalCount: total });
  } catch (error) {
    console.error("GET /api/payments/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch payment stats" }, { status: 500 });
  }
}
