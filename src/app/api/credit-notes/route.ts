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
    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        orderBy: buildReturnOrderBy(sort),
        skip,
        take,
        include: {
          _count: { select: { items: true } },
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true, updatedAt: true } } } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.return.count({ where }),
    ]);

    // `Return.createdByUserId` is nullable — a row created before this column existed (2026-09-24)
    // has no creator on file and shows "—" on the list, same as it did under the old lookup for a
    // return whose activity log entry had already been purged.
    const data = returns.map((r) => ({ ...r, createdBy: r.createdBy?.name ?? null }));
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch credit notes" }, { status: 500 });
  }
}
