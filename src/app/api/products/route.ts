import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getProducts } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const products = await getProducts(search);
    return NextResponse.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { name, description, sku, unit, price, gstRate, stock, minStock, categoryId, brandId } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        name, description, sku, unit,
        price: parseFloat(price),
        gstRate: gstRate !== undefined ? parseFloat(gstRate) : 18,
        stock: stock !== undefined ? parseInt(stock) : 0,
        minStock: minStock !== undefined ? parseInt(minStock) : 5,
        categoryId: categoryId || null,
        brandId: brandId || null,
      },
      include: { category: true, brand: true },
    });

    if (session?.user?.id) {
      await logActivity(session.user.id, "add_product", `Added product "${name}" | SKU: ${sku || "—"} | Price: ₹${parseFloat(price).toFixed(2)} | GST: ${gstRate ?? 18}% | Stock: ${stock ?? 0} ${unit || "Nos"}`, product.id, "product");
    }
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
