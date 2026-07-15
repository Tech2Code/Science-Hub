import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 5000,
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const trimmedName = typeof body.name === "string" ? body.name.trim() : "";

    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const category = await prisma.category.create({ data: { name: trimmedName } });

    await logActivity(auth.session.user.id, "add_category", `Added category "${trimmedName}"`, category.id, "category");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    console.error("POST /api/categories error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
