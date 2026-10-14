import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateProductInput, validateNumericField, MAX_MONEY_VALUE } from "@/lib/validation";


// brandId/categoryId must point at a real, non-binned row — otherwise a garbage id surfaces as a raw
// FK 500 and a binned one silently attaches the product to a Recycle Bin entry.
async function checkTaxonomyRef(kind: "brand" | "category", refId: unknown): Promise<string | null> {
  if (typeof refId !== "string") return `Invalid ${kind}.`;
  const label = kind === "brand" ? "Brand" : "Category";
  const row = kind === "brand"
    ? await prisma.brand.findUnique({ where: { id: refId }, select: { name: true, deletedAt: true } })
    : await prisma.category.findUnique({ where: { id: refId }, select: { name: true, deletedAt: true } });
  if (!row) return `Selected ${kind} no longer exists.`;
  if (row.deletedAt) return `${label} "${row.name}" is in the Recycle Bin — restore it or choose another ${kind}.`;
  return null;
}

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

    const log = await prisma.activityLog.findFirst({
      where: { entityId: id, action: "add_product" },
      select: { createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      ...product,
      createdBy: log?.user.name ?? null,
      createdAt: product.createdAt ?? log?.createdAt ?? null,
    });
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
    const { name, description, sku, hsn, unit, price, purchasePrice, listPrice, discountPercent, gstRate, minStock, categoryId, brandId, expectedUpdatedAt } = body;

    const existing = await prisma.product.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true, brandId: true, categoryId: true } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This product is in the bin — restore it before editing" }, { status: 400 });
    }
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This product was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    const fieldLengthErr = validateProductInput({ name, sku, hsn, description });
    if (fieldLengthErr) return NextResponse.json({ error: fieldLengthErr }, { status: 400 });
    if (name !== undefined) {
      const trimmedName = (name as string).trim();
      const duplicate = await prisma.product.findFirst({
        where: { name: { equals: trimmedName, mode: "insensitive" }, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: `A product named "${trimmedName}" already exists` }, { status: 409 });
      }
      data.name = trimmedName;
    }
    if (description !== undefined) data.description = description;
    if (sku !== undefined) data.sku = typeof sku === "string" ? sku.trim() || null : null;
    if (hsn !== undefined) data.hsn = typeof hsn === "string" ? hsn.trim() || null : null;
    if (unit !== undefined) {
      const trimmedUnit = typeof unit === "string" ? unit.trim() : "";
      if (!trimmedUnit) return NextResponse.json({ error: "Unit is required." }, { status: 400 });
      data.unit = trimmedUnit;
    }
    if (purchasePrice !== undefined) {
      if (purchasePrice === null || purchasePrice === "") {
        return NextResponse.json({ error: "Purchase price is required." }, { status: 400 });
      }
      const parsed = parseFloat(purchasePrice as string);
      const err = validateNumericField("purchasePrice", parsed, { min: 0, max: MAX_MONEY_VALUE });
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.purchasePrice = parsed;
    }
    if (listPrice !== undefined) {
      if (listPrice === null || listPrice === "") {
        return NextResponse.json({ error: "List price is required." }, { status: 400 });
      }
      const parsed = parseFloat(listPrice as string);
      const err = validateNumericField("listPrice", parsed, { min: 0, max: MAX_MONEY_VALUE });
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.listPrice = parsed;
    }
    // `stock` is deliberately not accepted here — changes must go through /api/products/[id]/adjust-stock so the ledger stays authoritative.
    const numericFields: [string, unknown, number, number, boolean][] = [
      ["price", price, 0, MAX_MONEY_VALUE, false],
      ["gstRate", gstRate, 0, 100, false],
      ["minStock", minStock, 0, Infinity, true],
      ["discountPercent", discountPercent, 0, 100, false],
    ];
    for (const [key, value, min, max, mustBeInteger] of numericFields) {
      if (value === undefined) continue;
      const parsed = parseFloat(value as string);
      const err = validateNumericField(key, parsed, { min, max, integer: mustBeInteger });
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data[key] = parsed;
    }
    // Re-sending the product's current brand/category unchanged is always allowed (it may have been
    // binned after assignment); a newly-chosen one must exist and not be in the bin.
    if (categoryId && categoryId !== existing.categoryId) {
      const refErr = await checkTaxonomyRef("category", categoryId);
      if (refErr) return NextResponse.json({ error: refErr }, { status: 400 });
    }
    if (brandId && brandId !== existing.brandId) {
      const refErr = await checkTaxonomyRef("brand", brandId);
      if (refErr) return NextResponse.json({ error: refErr }, { status: 400 });
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
    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, sku: true, price: true, stock: true, unit: true, deletedAt: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    // A repeat DELETE (double-click, stale tab) would otherwise reset deletedAt — restarting the
    // 30-day bin countdown — and write a second delete_product log entry.
    if (product.deletedAt) return NextResponse.json({ error: "This product is already in the bin." }, { status: 400 });
    const [invoiceItemCount, purchaseItemCount] = await Promise.all([
      prisma.invoiceItem.count({ where: { productId: id, invoice: { deletedAt: null } } }),
      prisma.purchaseBillItem.count({ where: { productId: id, purchaseBill: { deletedAt: null } } }),
    ]);
    if (invoiceItemCount > 0) {
      return NextResponse.json(
        { error: `"${product.name}" is used in ${invoiceItemCount} invoice line item${invoiceItemCount > 1 ? "s" : ""} and cannot be deleted.` },
        { status: 400 }
      );
    }
    if (purchaseItemCount > 0) {
      return NextResponse.json(
        { error: `"${product.name}" is used in ${purchaseItemCount} purchase bill line item${purchaseItemCount > 1 ? "s" : ""} and cannot be deleted.` },
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
