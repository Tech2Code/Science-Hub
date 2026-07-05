import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const brand = await prisma.brand.findUnique({ where: { id }, select: { name: true, _count: { select: { products: true } } } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const invoiceItemCount = await prisma.invoiceItem.count({ where: { product: { brandId: id } } });
    if (invoiceItemCount > 0) {
      return NextResponse.json(
        { error: `"${brand.name}" has products used in ${invoiceItemCount} invoice line item${invoiceItemCount > 1 ? "s" : ""} and cannot be deleted.` },
        { status: 400 }
      );
    }

    await prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });

    const affected = brand._count.products > 0 ? ` | ${brand._count.products} product(s) still assigned` : "";
    await logActivity(auth.session.user.id, "delete_brand", `Moved brand "${brand.name}" to bin${affected}`, id, "brand");
    return NextResponse.json({ message: "Brand moved to bin" });
  } catch (error) {
    console.error("DELETE /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
