import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProducts } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateProductInput, validateNumericField } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const products = await getProducts(search);
    const ids = products.map((p) => p.id);
    const logs = await prisma.activityLog.findMany({
      where: { entityId: { in: ids }, action: "add_product" },
      select: { entityId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const createdByMap = new Map(logs.map((l) => [l.entityId, l.user.name]));
    const result = products.map((p) => ({ ...p, createdBy: createdByMap.get(p.id) ?? null }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, description, sku, unit, price, purchasePrice, gstRate, stock, minStock, categoryId, brandId } = body;
    const coreErr = validateProductInput({ name, price }, true);
    if (coreErr) return NextResponse.json({ error: coreErr }, { status: 400 });
    const trimmedName = (name as string).trim();

    const parsedPrice = parseFloat(price);
    const parsedPurchasePrice = purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "" ? parseFloat(purchasePrice) : null;
    const parsedGstRate = gstRate !== undefined ? parseFloat(gstRate) : 18;
    const parsedStock = stock !== undefined ? parseFloat(stock) : 0;
    const parsedMinStock = minStock !== undefined ? parseFloat(minStock) : 5;
    const numericErr =
      validateNumericField("price", parsedPrice, { min: 0 }) ||
      validateNumericField("gstRate", parsedGstRate, { min: 0, max: 100 }) ||
      validateNumericField("stock", parsedStock, { min: 0, integer: true }) ||
      validateNumericField("minStock", parsedMinStock, { min: 0, integer: true }) ||
      (parsedPurchasePrice !== null ? validateNumericField("purchasePrice", parsedPurchasePrice, { min: 0 }) : null);
    if (numericErr) return NextResponse.json({ error: numericErr }, { status: 400 });

    const trimmedSku = typeof sku === "string" ? sku.trim() || null : null;

    const product = await prisma.product.create({
      data: {
        name: trimmedName, description, sku: trimmedSku, unit,
        price: parsedPrice,
        purchasePrice: parsedPurchasePrice,
        gstRate: parsedGstRate,
        stock: parsedStock,
        minStock: parsedMinStock,
        categoryId: categoryId || null,
        brandId: brandId || null,
      },
      include: { category: true, brand: true },
    });

    await logActivity(auth.session.user.id, "add_product", `Added product "${trimmedName}" | SKU: ${trimmedSku || "—"} | Price: ₹${parsedPrice.toFixed(2)} | GST: ${parsedGstRate}% | Stock: ${parsedStock} ${unit || "Nos"}`, product.id, "product");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "SKU already in use" }, { status: 409 });
    }
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
