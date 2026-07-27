import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { parsePageParams, monthYearToDateRange } from "@/lib/listQuery";
import { buildPurchasePaymentWhere, buildPurchasePaymentOrderBy, type PurchasePaymentSort } from "@/lib/purchasePaymentQuery";

export async function GET(request: NextRequest) {
  try {
    // Aligned with the sibling Payments-Received route, which already gates
    // on its matching section — this route previously only required a
    // session, leaving it reachable by any signed-in user regardless of
    // their "payments_made" grant.
    const auth = await requireSectionAccess("payments_made");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as PurchasePaymentSort | undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const { skip, take } = parsePageParams(searchParams, 5000);

    const where = buildPurchasePaymentWhere({ search, dateRange });
    const [data, total] = await Promise.all([
      prisma.purchasePayment.findMany({
        where,
        orderBy: buildPurchasePaymentOrderBy(sort),
        skip,
        take,
        include: { purchaseBill: { select: { billNumber: true, vendor: { select: { name: true } } } } },
      }),
      prisma.purchasePayment.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/purchase-bills/payments error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase payments" }, { status: 500 });
  }
}
