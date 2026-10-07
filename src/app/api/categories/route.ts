import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { buildCategoryWhere, buildCategoryOrderBy, type CategorySort } from "@/lib/categoryQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as CategorySort | undefined;
    const { skip, take } = parsePageParams(searchParams, 5000);

    const where = buildCategoryWhere(search);

    // ?slim=1 — dropdown/picker callers only need { id, name }; skip product counts.
    if (searchParams.get("slim") === "1") {
      const [data, total] = await Promise.all([
        prisma.category.findMany({ where, orderBy: buildCategoryOrderBy(sort), skip, take, select: { id: true, name: true } }),
        prisma.category.count({ where }),
      ]);
      return NextResponse.json({ data, total });
    }
    const [data, total] = await Promise.all([
      prisma.category.findMany({
        where,
        orderBy: buildCategoryOrderBy(sort),
        skip,
        take,
        include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      }),
      prisma.category.count({ where }),
    ]);

    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
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

    const category = await prisma.category.create({ data: { name: trimmedName } });

    await logActivity(auth.session.user.id, "add_category", `Added category "${trimmedName}"`, category.id, "category");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The unique index covers soft-deleted rows too — point the user at the Bin instead of a
      // confusing "already exists" when the only clash is a category they can't see in the list.
      const clash = trimmedName ? await prisma.category.findUnique({ where: { name: trimmedName }, select: { deletedAt: true } }).catch(() => null) : null;
      if (clash?.deletedAt) {
        return NextResponse.json({ error: `A category named "${trimmedName}" is in the Recycle Bin — restore it from the Bin instead.` }, { status: 409 });
      }
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    console.error("POST /api/categories error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
