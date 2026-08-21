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
        },
      }),
      prisma.return.count({ where }),
    ]);

    // Returns have no creator FK — the creator is only in the invoice's "create_return" log entry
    // (keyed by invoiceId), so disambiguate multiple returns via the credit note number in its text.
    const invoiceIds = [...new Set(returns.map((r) => r.invoiceId))];
    const logs = invoiceIds.length
      ? await prisma.activityLog.findMany({
          where: { action: "create_return", entityId: { in: invoiceIds } },
          select: { entityId: true, details: true, user: { select: { name: true } } },
        })
      : [];
    const data = returns.map((r) => {
      const match = r.creditNoteNumber
        ? logs.find((l) => l.entityId === r.invoiceId && l.details.includes(`Credit note ${r.creditNoteNumber} `))
        : undefined;
      return { ...r, createdBy: match?.user.name ?? null };
    });
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch credit notes" }, { status: 500 });
  }
}
