import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProducts, getProductsSlim, type ProductSort, type ProductStockFilter } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateProductInput, validateNumericField, MAX_MONEY_VALUE } from "@/lib/validation";
import { parsePageParams } from "@/lib/listQuery";

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const stockFilter = (searchParams.get("stockFilter") ?? undefined) as ProductStockFilter | undefined;
    const sort = (searchParams.get("sort") ?? undefined) as ProductSort | undefined;
    const { skip, take } = parsePageParams(searchParams, 5000);

    // ?slim=1 — line-item pickers only need pricing/stock fields; skip the joins and the createdBy lookup.
    if (searchParams.get("slim") === "1") {
      const slim = await getProductsSlim({ search, stockFilter }, sort, skip, take);
      return NextResponse.json(slim);
    }

    const { data: products, total } = await getProducts({ search, stockFilter }, sort, skip, take);
    const ids = products.map((p) => p.id);
    const logs = await prisma.activityLog.findMany({
      where: { entityId: { in: ids }, action: "add_product" },
      select: { entityId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const createdByMap = new Map(logs.map((l) => [l.entityId, l.user.name]));
    const data = products.map((p) => ({ ...p, createdBy: createdByMap.get(p.id) ?? null }));
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let rawSkuForError = "";
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, description, sku, hsn, unit, price, purchasePrice, listPrice, discountPercent, gstRate, stock, minStock, categoryId, brandId } = body;
    rawSkuForError = typeof sku === "string" ? sku.trim() : "";
    const coreErr = validateProductInput({ name, price, sku, hsn, description }, true);
    if (coreErr) return NextResponse.json({ error: coreErr }, { status: 400 });
    const trimmedName = (name as string).trim();

    const parsedPrice = parseFloat(price);
    const parsedListPrice = listPrice !== undefined && listPrice !== null && listPrice !== "" ? parseFloat(listPrice) : null;
    const parsedDiscountPercent = discountPercent !== undefined && discountPercent !== null && discountPercent !== "" ? parseFloat(discountPercent) : 0;
    const parsedPurchasePrice =
      parsedListPrice !== null && !isNaN(parsedListPrice) && !isNaN(parsedDiscountPercent)
        ? Math.round(parsedListPrice * (1 - parsedDiscountPercent / 100) * 100) / 100
        : purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== ""
          ? parseFloat(purchasePrice)
          : null;
    const parsedGstRate = gstRate !== undefined ? parseFloat(gstRate) : 18;
    const parsedStock = stock !== undefined ? parseFloat(stock) : 0;
    const parsedMinStock = minStock !== undefined ? parseFloat(minStock) : 5;
    if (parsedListPrice === null) {
      return NextResponse.json({ error: "List price is required." }, { status: 400 });
    }
    const numericErr =
      validateNumericField("price", parsedPrice, { min: 0, max: MAX_MONEY_VALUE }) ||
      validateNumericField("gstRate", parsedGstRate, { min: 0, max: 100 }) ||
      validateNumericField("stock", parsedStock, { min: 0, integer: true }) ||
      validateNumericField("minStock", parsedMinStock, { min: 0, integer: true }) ||
      validateNumericField("discountPercent", parsedDiscountPercent, { min: 0, max: 100 }) ||
      (parsedPurchasePrice !== null ? validateNumericField("purchasePrice", parsedPurchasePrice, { min: 0, max: MAX_MONEY_VALUE }) : "Purchase price is required.") ||
      validateNumericField("listPrice", parsedListPrice, { min: 0, max: MAX_MONEY_VALUE });
    if (numericErr) return NextResponse.json({ error: numericErr }, { status: 400 });

    const trimmedUnit = typeof unit === "string" ? unit.trim() : "";
    if (!trimmedUnit) return NextResponse.json({ error: "Unit is required." }, { status: 400 });
    if (brandId) {
      const refErr = await checkTaxonomyRef("brand", brandId);
      if (refErr) return NextResponse.json({ error: refErr }, { status: 400 });
    }
    if (categoryId) {
      const refErr = await checkTaxonomyRef("category", categoryId);
      if (refErr) return NextResponse.json({ error: refErr }, { status: 400 });
    }

    const trimmedSku = typeof sku === "string" ? sku.trim() || null : null;
    const trimmedHsn = typeof hsn === "string" ? hsn.trim() || null : null;

    const duplicate = await prisma.product.findFirst({
      where: { name: { equals: trimmedName, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: `A product named "${trimmedName}" already exists` }, { status: 409 });
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: trimmedName, description, sku: trimmedSku, hsn: trimmedHsn, unit: trimmedUnit,
          price: parsedPrice,
          purchasePrice: parsedPurchasePrice,
          listPrice: parsedListPrice,
          discountPercent: parsedDiscountPercent,
          gstRate: parsedGstRate,
          stock: parsedStock,
          minStock: parsedMinStock,
          categoryId: categoryId || null,
          brandId: brandId || null,
        },
        include: { category: true, brand: true },
      });
      if (parsedStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            productName: created.name,
            type: "manual",
            documentType: "manual",
            quantity: parsedStock,
            balanceAfter: parsedStock,
            notes: "Opening stock on product creation",
            createdByUserId: auth.session.user.id,
          },
        });
      }
      return created;
    });

    await logActivity(auth.session.user.id, "add_product", `Added product "${trimmedName}" | SKU: ${trimmedSku || "—"} | Price: ₹${parsedPrice.toFixed(2)} | GST: ${parsedGstRate}% | Stock: ${parsedStock} ${trimmedUnit}`, product.id, "product");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (rawSkuForError) {
        const binned = await prisma.product.findFirst({ where: { sku: rawSkuForError, deletedAt: { not: null } }, select: { name: true } }).catch(() => null);
        if (binned) {
          return NextResponse.json(
            { error: `SKU "${rawSkuForError}" is used by "${binned.name}" in the Recycle Bin — restore or permanently delete it first` },
            { status: 409 }
          );
        }
      }
      return NextResponse.json({ error: "SKU already in use" }, { status: 409 });
    }
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
