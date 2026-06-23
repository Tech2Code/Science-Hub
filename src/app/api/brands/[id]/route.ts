import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    const brand = await prisma.brand.findUnique({ where: { id }, select: { name: true, _count: { select: { products: true } } } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    await prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    if (session?.user?.id) {
      const affected = brand._count.products > 0 ? ` | ${brand._count.products} product(s) still assigned` : "";
      await logActivity(session.user.id, "delete_brand", `Moved brand "${brand.name}" to bin${affected}`, id, "brand");
    }
    return NextResponse.json({ message: "Brand moved to bin" });
  } catch (error) {
    console.error("DELETE /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
