import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateProductInput, validateNumericField } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        brand: true,
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, type: true, documentType: true, quantity: true, balanceAfter: true, reference: true, notes: true, createdAt: true },
        },
      },
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
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, description, sku, unit, price, purchasePrice, gstRate, stock, minStock, categoryId, brandId, expectedUpdatedAt } = body;

    const existing = await prisma.product.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This product is in the bin — restore it before editing" }, { status: 400 });
    }
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This product was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const coreErr = validateProductInput({ name });
      if (coreErr) return NextResponse.json({ error: coreErr }, { status: 400 });
      data.name = (name as string).trim();
    }
    if (description !== undefined) data.description = description;
    if (sku !== undefined) data.sku = typeof sku === "string" ? sku.trim() || null : null;
    if (unit !== undefined) data.unit = unit;
    if (purchasePrice !== undefined) {
      if (purchasePrice === null || purchasePrice === "") {
        data.purchasePrice = null;
      } else {
        const parsed = parseFloat(purchasePrice as string);
        const err = validateNumericField("purchasePrice", parsed, { min: 0 });
        if (err) return NextResponse.json({ error: err }, { status: 400 });
        data.purchasePrice = parsed;
      }
    }
    const numericFields: [string, unknown, number, number, boolean][] = [
      ["price", price, 0, Infinity, false],
      ["gstRate", gstRate, 0, 100, false],
      ["stock", stock, 0, Infinity, true],
      ["minStock", minStock, 0, Infinity, true],
    ];
    for (const [key, value, min, max, mustBeInteger] of numericFields) {
      if (value === undefined) continue;
      const parsed = parseFloat(value as string);
      const err = validateNumericField(key, parsed, { min, max, integer: mustBeInteger });
      if (err) return NextResponse.json({ error: err }, { status: 400 });
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
      return NextResponse.json({ error: "SKU already in use" }, { status: 409 });
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
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, sku: true, price: true, stock: true, unit: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const invoiceItemCount = await prisma.invoiceItem.count({ where: { productId: id, invoice: { deletedAt: null } } });
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
