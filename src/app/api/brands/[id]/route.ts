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

    // Unassign products before deleting (brandId is optional)
    await prisma.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
    await prisma.brand.delete({ where: { id } });

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    if (session?.user?.id && brand) {
      const affected = brand._count.products > 0 ? ` | ${brand._count.products} product(s) unassigned` : "";
      await logActivity(session.user.id, "delete_brand", `Deleted brand "${brand.name}"${affected}`, id, "brand");
    }
    return NextResponse.json({ message: "Brand deleted" });
  } catch (error) {
    console.error("DELETE /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
