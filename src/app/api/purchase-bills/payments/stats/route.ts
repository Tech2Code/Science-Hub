import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { buildPurchasePaymentWhere } from "@/lib/purchasePaymentQuery";

export async function GET() {
  try {
    const auth = await requireSectionAccess("payments_made");
    if (!auth.ok) return auth.response;

    const where = buildPurchasePaymentWhere({});
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
