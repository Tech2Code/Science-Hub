import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { dateRangeFromParams, financialYearRangeFromParams } from "@/lib/listQuery";
import { buildBillWhere } from "@/lib/purchaseBillQuery";
import { istTodayStartUtc } from "@/lib/validation";

// Kept separate from the paginated list route, since a single page of rows can't produce a correct total.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateRange = dateRangeFromParams(searchParams);
    const outsideRange = financialYearRangeFromParams(searchParams);

    const where = buildBillWhere({ status, dateRange });
    // Every other purchase-spend aggregation in the app (Purchase Reports Summary/Category, GST
    // Filing's purchase register, the Purchase/Combined Dashboards) excludes cancelled bills from
    // money totals — a cancelled bill keeps its `total`/`paidAmount` for audit, but "spend" should
    // never count it. `buildBillWhere()` itself leaves cancelled bills in on the "All" tab (status
    // unset) by design, since the list view must still show them — so the stats aggregate gets its
    // own narrower where, excluding cancelled unless the user explicitly asked for the Cancelled tab.
    const aggWhere = status === "cancelled" ? where : { ...where, status: where.status ?? { not: "cancelled" as const } };
    const [agg, totalCount, overdueCount, years, outside] = await Promise.all([
      prisma.purchaseBill.aggregate({ where: aggWhere, _sum: { total: true, paidAmount: true } }),
      prisma.purchaseBill.count({ where }),
      // Nested AND (not merged into `where`) so a status tab's own meaning isn't overwritten by the overdue condition's status constraint.
      prisma.purchaseBill.count({ where: { AND: [where, { status: { notIn: ["paid", "cancelled"] }, dueDate: { lt: istTodayStartUtc() } }] } }),
      // billDate is stored as IST midnight (= 18:30 UTC the previous day), so the year must be
      // extracted in IST — a bare EXTRACT on the UTC value put every 1 Jan bill in the previous year.
      prisma.$queryRaw<{ year: number }[]>`SELECT DISTINCT EXTRACT(YEAR FROM ("billDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int AS year FROM "PurchaseBill" WHERE "deletedAt" IS NULL ORDER BY year DESC`,
      // Unpaid money on bills OUTSIDE the selected period, so the page can say the list is scoped to one financial year.
      outsideRange
        ? prisma.purchaseBill.aggregate({
            where: { deletedAt: null, status: { notIn: ["paid", "cancelled"] }, OR: [{ billDate: { lt: outsideRange.gte } }, { billDate: { gte: outsideRange.lt } }] },
            _sum: { balanceDue: true }, _count: true,
          })
        : null,
    ]);
    const totalPurchase = agg._sum.total ?? 0;
    const totalPaid = agg._sum.paidAmount ?? 0;
    return NextResponse.json({
      totalCount,
      totalPurchase,
      totalPaid,
      totalPending: totalPurchase - totalPaid,
      overdueCount,
      availableYears: years.map((y) => y.year),
      outsidePeriod: { count: outside?._count ?? 0, amount: outside?._sum.balanceDue ?? 0 },
    });
  } catch (error) {
    console.error("GET /api/purchase-bills/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase bill stats" }, { status: 500 });
  }
}
