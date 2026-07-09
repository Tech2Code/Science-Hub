import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        products: {
          where: { deletedAt: null },
          select: { id: true, name: true, sku: true, price: true, stock: true, minStock: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const log = await prisma.activityLog.findFirst({
      where: { entityId: id, action: "add_brand" },
      select: { createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      ...brand,
      createdBy: log?.user.name ?? null,
      createdAt: brand.createdAt ?? log?.createdAt ?? null,
    });
  } catch (error) {
    console.error("GET /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch brand" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const brand = await prisma.brand.findUnique({ where: { id }, select: { name: true, _count: { select: { products: { where: { deletedAt: null } } } } } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const invoiceItemCount = await prisma.invoiceItem.count({ where: { product: { brandId: id } } });
    if (invoiceItemCount > 0) {
      return NextResponse.json(
        { error: `"${brand.name}" has products used in ${invoiceItemCount} invoice line item${invoiceItemCount > 1 ? "s" : ""} and cannot be deleted.` },
        { status: 400 }
      );
    }
    if (brand._count.products > 0) {
      return NextResponse.json(
        { error: `"${brand.name}" has ${brand._count.products} product(s) assigned and cannot be deleted. Reassign or delete those products first.` },
        { status: 400 }
      );
    }

    await prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });

    await logActivity(auth.session.user.id, "delete_brand", `Moved brand "${brand.name}" to bin`, id, "brand");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Brand moved to bin" });
  } catch (error) {
    console.error("DELETE /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
