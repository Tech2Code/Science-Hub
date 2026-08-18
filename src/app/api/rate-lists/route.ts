import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateRateListInput } from "@/lib/validation";
import { parsePageParams } from "@/lib/listQuery";
import { buildRateListWhere, buildRateListOrderBy, type RateListSort } from "@/lib/rateListQuery";
import { validateAndBuildRateListItems } from "@/lib/rateListForm";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as RateListSort | undefined;
    const { skip, take } = parsePageParams(searchParams, 2000);

    const where = buildRateListWhere(search);
    const [data, total] = await Promise.all([
      prisma.rateList.findMany({
        where,
        orderBy: buildRateListOrderBy(sort),
        skip,
        take,
        include: { createdBy: { select: { name: true } }, _count: { select: { items: true } } },
      }),
      prisma.rateList.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/rate-lists error:", error);
    return NextResponse.json({ error: "Failed to fetch rate lists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { title, note, items } = body;

    const validationError = validateRateListInput({ title, note });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const itemsResult = validateAndBuildRateListItems(items);
    if ("error" in itemsResult) return NextResponse.json({ error: itemsResult.error }, { status: 400 });

    const rateList = await prisma.rateList.create({
      data: {
        title: (title as string).trim(),
        note: typeof note === "string" ? note.trim() || null : null,
        createdByUserId: auth.session.user.id,
        items: { create: itemsResult.items },
      },
      include: { items: true, createdBy: { select: { name: true } } },
    });

    await logActivity(auth.session.user.id, "create_rate_list", `Created rate list "${rateList.title}" | Items: ${itemsResult.items.length}`, rateList.id, "rate_list");
    revalidateTag("rate-lists", { expire: 0 });
    return NextResponse.json(rateList, { status: 201 });
  } catch (error) {
    console.error("POST /api/rate-lists error:", error);
    return NextResponse.json({ error: "Failed to create rate list" }, { status: 500 });
  }
}
