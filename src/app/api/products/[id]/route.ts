import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, description, sku, unit, price, gstRate, stock, minStock, categoryId, brandId } = body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) return NextResponse.json({ error: "Name cannot be blank" }, { status: 400 });
      data.name = trimmedName;
    }
    if (description !== undefined) data.description = description;
    if (sku !== undefined) data.sku = typeof sku === "string" ? sku.trim() || null : null;
    if (unit !== undefined) data.unit = unit;
    const numericFields: [string, unknown, number, number, boolean][] = [
      ["price", price, 0, Infinity, false],
      ["gstRate", gstRate, 0, 100, false],
      ["stock", stock, 0, Infinity, true],
      ["minStock", minStock, 0, Infinity, true],
    ];
    for (const [key, value, min, max, mustBeInteger] of numericFields) {
      if (value === undefined) continue;
      const parsed = parseFloat(value as string);
      if (Number.isNaN(parsed)) {
        return NextResponse.json({ error: `${key} must be a valid number` }, { status: 400 });
      }
      if (parsed < min || parsed > max) {
        return NextResponse.json({ error: `${key} must be between ${min} and ${max === Infinity ? "∞" : max}` }, { status: 400 });
      }
      if (mustBeInteger && !Number.isInteger(parsed)) {
        return NextResponse.json({ error: `${key} must be a whole number` }, { status: 400 });
      }
      data[key] = parsed;
    }
    if (categoryId !== undefined) data.categoryId = categoryId || null;
    if (brandId !== undefined) data.brandId = brandId || null;
    const product = await prisma.product.update({
      where: { id }, data,
      include: { category: true, brand: true },
    });
    await logActivity(auth.session.user.id, "update_product", `Updated product "${product.name}" | SKU: ${product.sku || "—"} | Price: ₹${product.price.toFixed(2)} | GST: ${product.gstRate}% | Stock: ${product.stock} ${product.unit || "Nos"}`, id, "product");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU already in use" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, sku: true, price: true, stock: true, unit: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const invoiceItemCount = await prisma.invoiceItem.count({ where: { productId: id } });
    if (invoiceItemCount > 0) {
      return NextResponse.json(
        { error: `"${product.name}" is used in ${invoiceItemCount} invoice line item${invoiceItemCount > 1 ? "s" : ""} and cannot be deleted.` },
        { status: 400 }
      );
    }
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(auth.session.user.id, "delete_product", `Moved product "${product.name}" to bin | SKU: ${product.sku || "—"} | Price: ₹${product.price.toFixed(2)} | Stock: ${product.stock} ${product.unit || "Nos"}`, id, "product");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Product moved to bin" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
