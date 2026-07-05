import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const brands = await prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
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
        createdAt: (b as unknown as { createdAt?: Date | null }).createdAt ?? log?.createdAt ?? null,
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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const brand = await prisma.brand.create({ data: { name } });

    await logActivity(auth.session.user.id, "add_brand", `Added brand "${name}"`, brand.id, "brand");
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    console.error("POST /api/brands error:", error);
    return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
  }
}
