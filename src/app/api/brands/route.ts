import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { buildBrandWhere, buildBrandOrderBy, type BrandSort } from "@/lib/brandQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as BrandSort | undefined;
    const { skip, take } = parsePageParams(searchParams, 5000);

    const where = buildBrandWhere(search);

    // ?slim=1 — dropdown/picker callers only need { id, name }; skip product counts and the createdBy lookup.
    if (searchParams.get("slim") === "1") {
      const [data, total] = await Promise.all([
        prisma.brand.findMany({ where, orderBy: buildBrandOrderBy(sort), skip, take, select: { id: true, name: true } }),
        prisma.brand.count({ where }),
      ]);
      return NextResponse.json({ data, total });
    }
    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        where,
        orderBy: buildBrandOrderBy(sort),
        skip,
        take,
        include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      }),
      prisma.brand.count({ where }),
    ]);
    const ids = brands.map((b) => b.id);
    const logs = await prisma.activityLog.findMany({
      where: { entityId: { in: ids }, action: "add_brand" },
      select: { entityId: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const logMap = new Map(logs.map((l) => [l.entityId, l]));
    const data = brands.map((b) => {
      const log = logMap.get(b.id);
      return {
        ...b,
        createdBy: log?.user.name ?? null,
        createdAt: b.createdAt ?? log?.createdAt ?? null,
      };
    });
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/brands error:", error);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let trimmedName = "";
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    trimmedName = typeof body.name === "string" ? body.name.trim() : "";

    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (trimmedName.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    }
    if (trimmedName.length > 200) {
      return NextResponse.json({ error: "Name is too long (max 200 characters)." }, { status: 400 });
    }

    const brand = await prisma.brand.create({ data: { name: trimmedName } });

    await logActivity(auth.session.user.id, "add_brand", `Added brand "${trimmedName}"`, brand.id, "brand");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The unique index covers soft-deleted rows too — point the user at the Bin instead of a
      // confusing "already exists" when the only clash is a brand they can't see in the list.
      const clash = trimmedName ? await prisma.brand.findUnique({ where: { name: trimmedName }, select: { deletedAt: true } }).catch(() => null) : null;
      if (clash?.deletedAt) {
        return NextResponse.json({ error: `A brand named "${trimmedName}" is in the Recycle Bin — restore it from the Bin instead.` }, { status: 409 });
      }
      return NextResponse.json({ error: "A brand with this name already exists" }, { status: 409 });
    }
    console.error("POST /api/brands error:", error);
    return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
  }
}
