import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { parsePageParams, monthYearToDateRange } from "@/lib/listQuery";
import { buildPaymentWhere, buildPaymentOrderBy, type PaymentSort } from "@/lib/paymentQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSectionAccess("payments_received");
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as PaymentSort | undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const { skip, take } = parsePageParams(searchParams, 5000);

    const where = buildPaymentWhere({ search, dateRange });
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: buildPaymentOrderBy(sort),
        skip,
        take,
        include: { invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } } },
      }),
      prisma.payment.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}
