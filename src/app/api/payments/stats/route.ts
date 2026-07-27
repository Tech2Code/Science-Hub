import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { buildPaymentWhere } from "@/lib/paymentQuery";

// Total collected across every payment — kept separate from the paginated
// list route since a single page of rows can no longer produce this sum.
export async function GET() {
  try {
    const auth = await requireSectionAccess("payments_received");
    if (!auth.ok) return auth.response;

    const where = buildPaymentWhere({});
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
