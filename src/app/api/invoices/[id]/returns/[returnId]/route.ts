import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";

// Soft-deletes a credit note (return) — reverses the stock it had restored
// and moves it to the bin, mirroring how invoice/purchase-bill deletion works.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; returnId: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id, returnId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const ret = await tx.return.findFirst({
        where: { id: returnId, invoiceId: id },
        include: { items: true },
      });
      if (!ret) return { found: false, alreadyDeleted: false };

      // Double-delete safe: only reverse stock if this call is the one that
      // actually transitions deletedAt from null to set.
      const updateResult = await tx.return.updateMany({
        where: { id: returnId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) return { found: true, alreadyDeleted: true, ret };

      await batchAdjustStock(
        tx,
        ret.items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, quantity: -i.quantity })),
        { type: "return_delete_reverse", reference: ret.creditNoteNumber ?? undefined, notes: "Credit note deleted", createdByUserId: auth.session.user.id }
      );

      return { found: true, alreadyDeleted: false, ret };
    }, { timeout: 20000, maxWait: 10000 });

    if (!result.found) return NextResponse.json({ error: "Credit note not found" }, { status: 404 });
    if (result.alreadyDeleted) return NextResponse.json({ message: "Already moved to bin" });

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    await logActivity(
      auth.session.user.id,
      "delete_return",
      `Deleted credit note ${result.ret?.creditNoteNumber ?? returnId}`,
      returnId,
      "return"
    );

    return NextResponse.json({ message: "Credit note moved to bin" });
  } catch (error) {
    console.error(error);
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete credit note" }, { status: 500 });
  }
}
