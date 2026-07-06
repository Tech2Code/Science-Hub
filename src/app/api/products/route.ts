import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProducts } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, description, sku, unit, price, purchasePrice, gstRate, stock, minStock, categoryId, brandId } = body;
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName || price === undefined) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
    }

    const parsedPrice = parseFloat(price);
    const parsedPurchasePrice = purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "" ? parseFloat(purchasePrice) : null;
    const parsedGstRate = gstRate !== undefined ? parseFloat(gstRate) : 18;
    const parsedStock = stock !== undefined ? parseFloat(stock) : 0;
    const parsedMinStock = minStock !== undefined ? parseFloat(minStock) : 5;
    if ([parsedPrice, parsedGstRate, parsedStock, parsedMinStock].some((n) => Number.isNaN(n))) {
      return NextResponse.json({ error: "Price, GST rate, stock, and min stock must be valid numbers" }, { status: 400 });
    }
    if (parsedPurchasePrice !== null && Number.isNaN(parsedPurchasePrice)) {
      return NextResponse.json({ error: "Purchase price must be a valid number" }, { status: 400 });
    }
    if (parsedPrice < 0) return NextResponse.json({ error: "Price cannot be negative" }, { status: 400 });
    if (parsedPurchasePrice !== null && parsedPurchasePrice < 0) return NextResponse.json({ error: "Purchase price cannot be negative" }, { status: 400 });
    if (parsedGstRate < 0 || parsedGstRate > 100) return NextResponse.json({ error: "GST rate must be between 0 and 100" }, { status: 400 });
    if (parsedStock < 0) return NextResponse.json({ error: "Stock cannot be negative" }, { status: 400 });
    if (parsedMinStock < 0) return NextResponse.json({ error: "Min stock cannot be negative" }, { status: 400 });
    if (!Number.isInteger(parsedStock) || !Number.isInteger(parsedMinStock)) {
      return NextResponse.json({ error: "Stock and min stock must be whole numbers" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "SKU already in use" }, { status: 400 });
    }
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
