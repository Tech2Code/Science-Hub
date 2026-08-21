import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { monthYearToDateRange } from "@/lib/listQuery";
import { buildReturnWhere } from "@/lib/creditNoteQuery";

function currentMonthRange(): { gte: Date; lt: Date } {
  const now = new Date();
  return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

// "Total" figures are always all-time; "period" figures follow the active month/year filter,
// defaulting to the current calendar month when none is set.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "") ?? currentMonthRange();

    const allTimeWhere = buildReturnWhere({});
    const periodWhere = buildReturnWhere({ dateRange });

    const [allTimeAgg, allTimeCount, periodAgg, periodCount, years] = await Promise.all([
      prisma.return.aggregate({ where: allTimeWhere, _sum: { total: true } }),
      prisma.return.count({ where: allTimeWhere }),
      prisma.return.aggregate({ where: periodWhere, _sum: { total: true } }),
      prisma.return.count({ where: periodWhere }),
      prisma.$queryRaw<{ year: number }[]>`SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "Return" WHERE "deletedAt" IS NULL ORDER BY year DESC`,
    ]);

    return NextResponse.json({
      totalCreditNotes: allTimeCount,
      totalCredited: allTimeAgg._sum.total ?? 0,
      periodCount,
      periodCredited: periodAgg._sum.total ?? 0,
      availableYears: years.map((y) => y.year),
    });
  } catch (error) {
    console.error("GET /api/credit-notes/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch credit note stats" }, { status: 500 });
  }
}
