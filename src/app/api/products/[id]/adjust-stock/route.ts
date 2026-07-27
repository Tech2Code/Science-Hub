import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";

// A dedicated, audited path for correcting stock after a physical stock
// take — the ledger already reserved a "manual" movement type for exactly
// this, but no screen previously used it, so fixing a discrepancy had no
// recorded, traceable route (someone would otherwise have to edit the
// Product row directly, leaving no ledger entry explaining why the number
// changed).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { newStock, notes } = body;

    if (typeof notes !== "string" || !notes.trim()) {
      return NextResponse.json({ error: "A reason is required for a manual stock adjustment." }, { status: 400 });
    }
    if (notes.trim().length > 500) {
      return NextResponse.json({ error: "Reason must be 500 characters or fewer." }, { status: 400 });
    }

    const parsedStock = Number(newStock);
    if (!Number.isFinite(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
      return NextResponse.json({ error: "New stock must be a whole number of 0 or more." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, stock: true, unit: true, deletedAt: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (product.deletedAt) {
      return NextResponse.json({ error: "This product is in the bin — restore it before adjusting its stock." }, { status: 400 });
    }

    const delta = parsedStock - product.stock;
    if (delta === 0) {
      return NextResponse.json({ error: "New stock is the same as the current stock — nothing to adjust." }, { status: 400 });
    }

    const [updated] = await prisma.$transaction(async (tx) => {
      return batchAdjustStock(
        tx,
        [{ productId: id, quantity: delta }],
        { type: "manual", notes: notes.trim(), createdByUserId: auth.session.user.id }
      );
    });

    await logActivity(
      auth.session.user.id,
      "manual_stock_adjustment",
      `Adjusted stock for "${product.name}" from ${product.stock} to ${parsedStock} ${product.unit || "Nos"} (${delta > 0 ? "+" : ""}${delta}) — ${notes.trim()}`,
      id,
      "product"
    );

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    return NextResponse.json({ id: updated.id, name: updated.name, stock: updated.stock });
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to adjust stock" }, { status: 500 });
  }
}
