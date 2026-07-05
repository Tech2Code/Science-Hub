import { NextRequest, NextResponse } from "next/server";
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
    const { name, description, sku, unit, price, gstRate, stock, minStock, categoryId, brandId } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
    }

    const parsedPrice = parseFloat(price);
    const parsedGstRate = gstRate !== undefined ? parseFloat(gstRate) : 18;
    const parsedStock = stock !== undefined ? parseInt(stock) : 0;
    const parsedMinStock = minStock !== undefined ? parseInt(minStock) : 5;
    if ([parsedPrice, parsedGstRate, parsedStock, parsedMinStock].some((n) => Number.isNaN(n))) {
      return NextResponse.json({ error: "Price, GST rate, stock, and min stock must be valid numbers" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        name, description, sku, unit,
        price: parsedPrice,
        gstRate: parsedGstRate,
        stock: parsedStock,
        minStock: parsedMinStock,
        categoryId: categoryId || null,
        brandId: brandId || null,
      },
      include: { category: true, brand: true },
    });

    await logActivity(auth.session.user.id, "add_product", `Added product "${name}" | SKU: ${sku || "—"} | Price: ₹${parsedPrice.toFixed(2)} | GST: ${parsedGstRate}% | Stock: ${parsedStock} ${unit || "Nos"}`, product.id, "product");
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
