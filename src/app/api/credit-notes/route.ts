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
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
      }),
      prisma.return.count({ where }),
    ]);

    // Returns have no direct creator FK — the creating user is only ever
    // recorded on the invoice's "create_return" activity log entry, keyed
    // by invoiceId (not the return's own id, since a return didn't exist
    // yet when that log's shape was designed). Disambiguate multiple
    // returns on the same invoice by matching the credit note number
    // embedded in the log's details text (unique per return).
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
