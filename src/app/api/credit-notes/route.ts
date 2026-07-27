import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { parsePageParams, monthYearToDateRange } from "@/lib/listQuery";
import { buildReturnWhere, buildReturnOrderBy, type CreditNoteSort } from "@/lib/creditNoteQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as CreditNoteSort | undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const { skip, take } = parsePageParams(searchParams, 5000);

    const where = buildReturnWhere({ search, dateRange });
    const [data, total] = await Promise.all([
      prisma.return.findMany({
        where,
        orderBy: buildReturnOrderBy(sort),
        skip,
        take,
        include: {
          _count: { select: { items: true } },
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
      }),
      prisma.return.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch credit notes" }, { status: 500 });
  }
}
