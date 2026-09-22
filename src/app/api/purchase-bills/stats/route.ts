import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";
import { buildBillWhere } from "@/lib/purchaseBillQuery";
import { istTodayStartUtc } from "@/lib/validation";

// Kept separate from the paginated list route, since a single page of rows can't produce a correct total.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");

    const where = buildBillWhere({ status, dateRange });
    // Every other purchase-spend aggregation in the app (Purchase Reports Summary/Category, GST
    // Filing's purchase register, the Purchase/Combined Dashboards) excludes cancelled bills from
    // money totals — a cancelled bill keeps its `total`/`paidAmount` for audit, but "spend" should
    // never count it. `buildBillWhere()` itself leaves cancelled bills in on the "All" tab (status
    // unset) by design, since the list view must still show them — so the stats aggregate gets its
    // own narrower where, excluding cancelled unless the user explicitly asked for the Cancelled tab.
    const aggWhere = status === "cancelled" ? where : { ...where, status: where.status ?? { not: "cancelled" as const } };
    const [agg, overdueCount, years] = await Promise.all([
      prisma.purchaseBill.aggregate({ where: aggWhere, _sum: { total: true, paidAmount: true } }),
      // Nested AND (not merged into `where`) so a status tab's own meaning isn't overwritten by the overdue condition's status constraint.
      prisma.purchaseBill.count({ where: { AND: [where, { status: { notIn: ["paid", "cancelled"] }, dueDate: { lt: istTodayStartUtc() } }] } }),
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
