import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const brands = await prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 5000,
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    const ids = brands.map((b) => b.id);
    const logs = await prisma.activityLog.findMany({
      where: { entityId: { in: ids }, action: "add_brand" },
      select: { entityId: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const logMap = new Map(logs.map((l) => [l.entityId, l]));
    const result = brands.map((b) => {
      const log = logMap.get(b.id);
      return {
        ...b,
        createdBy: log?.user.name ?? null,
        createdAt: b.createdAt ?? log?.createdAt ?? null,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/brands error:", error);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const trimmedName = typeof body.name === "string" ? body.name.trim() : "";

    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const brand = await prisma.brand.create({ data: { name: trimmedName } });

    await logActivity(auth.session.user.id, "add_brand", `Added brand "${trimmedName}"`, brand.id, "brand");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A brand with this name already exists" }, { status: 409 });
    }
    console.error("POST /api/brands error:", error);
    return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
  }
}
