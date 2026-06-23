import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, brand: true },
    });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { name, description, sku, unit, price, gstRate, stock, minStock, categoryId, brandId } = body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (sku !== undefined) data.sku = sku;
    if (unit !== undefined) data.unit = unit;
    if (price !== undefined) data.price = parseFloat(price);
    if (gstRate !== undefined) data.gstRate = parseFloat(gstRate);
    if (stock !== undefined) data.stock = parseInt(stock);
    if (minStock !== undefined) data.minStock = parseInt(minStock);
    if (categoryId !== undefined) data.categoryId = categoryId || null;
    if (brandId !== undefined) data.brandId = brandId || null;
    const product = await prisma.product.update({
      where: { id }, data,
      include: { category: true, brand: true },
    });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    if (session?.user?.id) {
      await logActivity(session.user.id, "update_product", `Updated product "${product.name}" | SKU: ${product.sku || "—"} | Price: ₹${product.price.toFixed(2)} | GST: ${product.gstRate}% | Stock: ${product.stock} ${product.unit || "Nos"}`, id, "product");
    }
    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, sku: true, price: true, stock: true, unit: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const invoiceItemCount = await prisma.invoiceItem.count({ where: { productId: id } });
    if (invoiceItemCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete "${product.name}" — it appears in ${invoiceItemCount} invoice line item(s). Remove it from those invoices first.` },
        { status: 400 }
      );
    }

    await prisma.product.delete({ where: { id } });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    if (session?.user?.id && product) {
      await logActivity(session.user.id, "delete_product", `Deleted product "${product.name}" | SKU: ${product.sku || "—"} | Price: ₹${product.price.toFixed(2)} | Stock: ${product.stock} ${product.unit || "Nos"}`, id, "product");
    }
    return NextResponse.json({ message: "Product deleted" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
