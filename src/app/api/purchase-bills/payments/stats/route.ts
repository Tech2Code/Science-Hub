import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";
import { buildPurchasePaymentWhere } from "@/lib/purchasePaymentQuery";

// Accepts the same search/month/year filters as the list route (same where-builder) — the Payments
// Made header shows "<count> payments · Total paid ₹X" next to the list's filtered count, so an
// unfiltered total here made the two numbers disagree as soon as the user searched.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSectionAccess("payments_made");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const where = buildPurchasePaymentWhere({ search, dateRange });
    const [agg, total] = await Promise.all([
      prisma.purchasePayment.aggregate({ where, _sum: { amount: true } }),
      prisma.purchasePayment.count({ where }),
    ]);
    return NextResponse.json({ totalPaid: agg._sum.amount ?? 0, totalCount: total });
  } catch (error) {
    console.error("GET /api/purchase-bills/payments/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase payment stats" }, { status: 500 });
  }
}
