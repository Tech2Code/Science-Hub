import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";

// Dedicated, audited path for correcting stock after a physical count — writes a "manual"
// ledger row so the change is traceable instead of editing the Product row directly.
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

    // Number(null) and Number("") are both 0 — without this, a blank field would silently zero the
    // product's stock. Only a real number or a non-empty numeric string is accepted.
    const isNumericInput =
      (typeof newStock === "number") ||
      (typeof newStock === "string" && newStock.trim() !== "");
    const parsedStock = isNumericInput ? Number(newStock) : NaN;
    if (!Number.isFinite(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
      return NextResponse.json({ error: "New stock must be a whole number of 0 or more." }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id }, select: { name: true, unit: true, deletedAt: true } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (product.deletedAt) {
      return NextResponse.json({ error: "This product is in the bin — restore it before adjusting its stock." }, { status: 400 });
    }

    // Current stock is read inside the transaction under a row lock (FOR UPDATE), so a sale/purchase
    // landing between the read and the write can't make the delta land on a stale baseline — the
    // result is always exactly the counted `newStock`.
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ stock: number }[]>`SELECT stock FROM "Product" WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) throw new ProductNotFoundError([id]);
      const previousStock = rows[0].stock;
      const delta = parsedStock - previousStock;
      if (delta === 0) return { unchanged: true as const };
      const [updated] = await batchAdjustStock(
        tx,
        [{ productId: id, quantity: delta }],
        { type: "manual", notes: notes.trim(), createdByUserId: auth.session.user.id }
      );
      return { unchanged: false as const, updated, previousStock, delta };
    });

    if (result.unchanged) {
      return NextResponse.json({ error: "New stock is the same as the current stock — nothing to adjust." }, { status: 400 });
    }
    const { updated, previousStock, delta } = result;

    await logActivity(
      auth.session.user.id,
      "manual_stock_adjustment",
      `Adjusted stock for "${product.name}" from ${previousStock} to ${parsedStock} ${product.unit || "Nos"} (${delta > 0 ? "+" : ""}${delta}) — ${notes.trim()}`,
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
