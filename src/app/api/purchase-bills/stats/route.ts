import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";
import { buildBillWhere } from "@/lib/purchaseBillQuery";

// Summary totals for the Purchase Bills list page's stat cards — kept
// separate from the paginated list route since a single page of rows can no
// longer produce a correct total once the list is server-paginated.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");

    const where = buildBillWhere({ status, dateRange });
    const [agg, overdueCount, years] = await Promise.all([
      prisma.purchaseBill.aggregate({ where, _sum: { total: true, paidAmount: true } }),
      // AND'd as a separate nested condition (not merged into `where`
      // directly) so a status tab keeps its own exact meaning instead of
      // being overwritten by the overdue condition's own status constraint.
      prisma.purchaseBill.count({ where: { AND: [where, { status: { notIn: ["paid", "cancelled"] }, dueDate: { lt: new Date() } }] } }),
      prisma.$queryRaw<{ year: number }[]>`SELECT DISTINCT EXTRACT(YEAR FROM "billDate")::int AS year FROM "PurchaseBill" WHERE "deletedAt" IS NULL ORDER BY year DESC`,
    ]);
    const totalPurchase = agg._sum.total ?? 0;
    const totalPaid = agg._sum.paidAmount ?? 0;
    return NextResponse.json({
      totalPurchase,
      totalPaid,
      totalPending: totalPurchase - totalPaid,
      overdueCount,
      availableYears: years.map((y) => y.year),
    });
  } catch (error) {
    console.error("GET /api/purchase-bills/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase bill stats" }, { status: 500 });
  }
}
