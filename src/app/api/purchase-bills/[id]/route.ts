import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { recordStockMovement } from "@/lib/stockMovement";
import { deleteAttachmentBlob, isPurchaseBillBlobUrl } from "@/lib/blobStorage";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, phone: true, email: true, gstin: true, address: true } },
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  payments: { orderBy: { date: "desc" as const } },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const bill = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null }, include: BILL_INCLUDE });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    return NextResponse.json(bill);
  } catch {
    return NextResponse.json({ error: "Failed to fetch bill" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { vendorId, billDate, dueDate, discount, notes, category, status, items, attachmentUrl, attachmentName } = body;

    if (attachmentUrl && !isPurchaseBillBlobUrl(attachmentUrl)) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    const existing = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    if (items !== undefined && (existing.status === "paid" || existing.status === "cancelled")) {
      return NextResponse.json(
        { error: `Items on a ${existing.status} bill cannot be edited.` },
        { status: 400 }
      );
    }

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const effectiveBillDate = billDate ? new Date(billDate) : existing.billDate;
      if (parsedDueDate < effectiveBillDate) {
        return NextResponse.json({ error: "Due date cannot be before the bill date" }, { status: 400 });
      }
    }

    let subtotal: number | undefined;
    let taxAmount: number | undefined;
    // Recomputed items (GST/total derived from quantity × price × rate, not
    // trusted from the client) — mirrors the POST route's fix; kept undefined
    // when items aren't being edited so the update below only touches items
    // when the caller actually sent a new set.
    let computedItems: Array<{
      productId?: string; name: string; quantity: number;
      unit?: string; purchasePrice: number; gstRate: number;
      discountPercent: number; discountAmount: number; gstAmount: number; total: number; itemSubtotal: number;
    }> | undefined;
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
      }
      for (const item of items as { quantity: number; purchasePrice: number; discountPercent?: number }[]) {
        const quantity = parseFloat(String(item.quantity));
        const purchasePrice = parseFloat(String(item.purchasePrice));
        const discountPercent = parseFloat(String(item.discountPercent ?? 0));
        if (!(quantity > 0)) return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
        if (!(purchasePrice >= 0)) return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
        if (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          return NextResponse.json({ error: "Item discount must be between 0 and 100%" }, { status: 400 });
        }
      }
      // Discount is applied to the line's gross amount before GST, same as
      // sales invoices and the POST route above.
      computedItems = (items as {
        productId?: string; name: string; quantity: number;
        unit?: string; purchasePrice: number; gstRate?: number; discountPercent?: number;
      }[]).map((item) => {
        const quantity = parseFloat(String(item.quantity));
        const purchasePrice = parseFloat(String(item.purchasePrice));
        const gstRate = parseFloat(String(item.gstRate ?? 0));
        const discountPercent = parseFloat(String(item.discountPercent ?? 0));
        const gross = quantity * purchasePrice;
        const discountAmount = gross * discountPercent / 100;
        const itemSubtotal = gross - discountAmount;
        const gstAmount = itemSubtotal * gstRate / 100;
        return { ...item, quantity, purchasePrice, gstRate, discountPercent, discountAmount, gstAmount, total: itemSubtotal + gstAmount, itemSubtotal };
      });
      subtotal = computedItems.reduce((s, i) => s + i.itemSubtotal, 0);
      taxAmount = computedItems.reduce((s, i) => s + i.gstAmount, 0);
    }

    const effectiveDiscount = discount !== undefined ? discount : existing.discount;
    const total = subtotal !== undefined && taxAmount !== undefined
      ? subtotal + taxAmount - effectiveDiscount
      : existing.subtotal + existing.taxAmount - effectiveDiscount;

    if (total < 0) {
      return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 });
    }

    // Status isn't a free-form field the user picks — it's derived from
    // paidAmount vs total, the same way invoices work, so editing items
    // (which changes total) can never leave a stale status behind. The one
    // status a user DOES set directly is "cancelled", via the dedicated
    // Cancel Bill action, which calls this route with only `{ status }` and
    // no `items` — that explicit value passes through untouched here.
    const effectiveStatus = items !== undefined
      ? (existing.paidAmount + 0.01 >= total ? "paid" : existing.paidAmount > 0 ? "partial" : "unpaid")
      : status;

    if (effectiveStatus === "paid" && existing.paidAmount + 0.01 < total) {
      return NextResponse.json(
        { error: "Cannot mark as paid — recorded payments don't cover the full total yet." },
        { status: 400 }
      );
    }

    // Cancelling a bill must reverse the stock it added on creation (mirrors
    // the DELETE handler below) — otherwise "Cancel Bill" silently leaves
    // phantom stock in inventory with no ledger trail. Un-cancelling
    // (status moved back off "cancelled") re-applies it symmetrically.
    const isCancelling = effectiveStatus === "cancelled" && existing.status !== "cancelled";
    const isUncancelling = effectiveStatus !== undefined && effectiveStatus !== "cancelled" && existing.status === "cancelled";

    const bill = await prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        // Reverse the stock the old line items added, then apply the new
        // ones — the exact inverse-then-reapply pattern used for invoice
        // item edits, so a re-priced or re-quantified purchase reconciles
        // stock instead of leaving it at whatever the original bill set.
        const oldItems = await tx.purchaseBillItem.findMany({
          where: { purchaseBillId: id },
          select: { productId: true, quantity: true },
        });
        for (const old of oldItems.filter(i => i.productId)) {
          const product = await tx.product.update({
            where: { id: old.productId! },
            data: { stock: { decrement: old.quantity } },
            select: { id: true, stock: true },
          });
          await recordStockMovement(tx, {
            productId: product.id,
            type: "adjustment",
            quantity: -old.quantity,
            balanceAfter: product.stock,
            reference: existing.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill edited — old items reversed",
            createdByUserId: session.user.id,
          });
        }
        await tx.purchaseBillItem.deleteMany({ where: { purchaseBillId: id } });
      }

      const updated = await tx.purchaseBill.update({
        where: { id },
        data: {
          ...(vendorId && { vendorId }),
          ...(billDate && { billDate: new Date(billDate) }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(subtotal !== undefined && { subtotal }),
          ...(taxAmount !== undefined && { taxAmount }),
          ...(discount !== undefined && { discount }),
          total,
          ...(notes !== undefined && { notes: notes || null }),
          ...(category !== undefined && { category: category || null }),
          ...(effectiveStatus !== undefined && { status: effectiveStatus }),
          ...(attachmentUrl !== undefined && { attachmentUrl: attachmentUrl || null }),
          ...(attachmentName !== undefined && { attachmentName: attachmentName || null }),
          ...(computedItems && {
            items: {
              create: computedItems.map(item => ({
                productId: item.productId || null,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit ?? "Nos",
                purchasePrice: item.purchasePrice,
                discountPercent: item.discountPercent,
                discountAmount: item.discountAmount,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount,
                total: item.total,
              })),
            },
          }),
        },
        include: BILL_INCLUDE,
      });

      if (computedItems) {
        for (const item of computedItems) {
          if (!item.productId) continue;
          const product = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
            select: { id: true, stock: true },
          });
          await recordStockMovement(tx, {
            productId: product.id,
            type: "adjustment",
            quantity: item.quantity,
            balanceAfter: product.stock,
            reference: updated.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill edited — new items applied",
            createdByUserId: session.user.id,
          });
        }
      }

      if (isCancelling || isUncancelling) {
        const currentItems = await tx.purchaseBillItem.findMany({
          where: { purchaseBillId: id },
          select: { productId: true, quantity: true },
        });
        for (const item of currentItems.filter(i => i.productId)) {
          const product = await tx.product.update({
            where: { id: item.productId! },
            data: { stock: { [isCancelling ? "decrement" : "increment"]: item.quantity } },
            select: { id: true, stock: true },
          });
          await recordStockMovement(tx, {
            productId: product.id,
            type: "adjustment",
            quantity: isCancelling ? -item.quantity : item.quantity,
            balanceAfter: product.stock,
            reference: updated.billNumber,
            purchaseBillId: id,
            notes: isCancelling ? "Purchase bill cancelled" : "Purchase bill un-cancelled",
            createdByUserId: session.user.id,
          });
        }
      }

      return updated;
    }, { timeout: 20000, maxWait: 10000 });

    // Attachment was replaced or removed — the old blob is now orphaned.
    if (attachmentUrl !== undefined && existing.attachmentUrl && existing.attachmentUrl !== attachmentUrl) {
      await deleteAttachmentBlob(existing.attachmentUrl);
    }

    await logActivity(session.user.id, "update_purchase_bill", `Updated purchase bill ${bill.billNumber}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    if (isCancelling || isUncancelling || items !== undefined) {
      revalidateTag("products", { expire: 0 });
      revalidateTag("reports", { expire: 0 });
    }
    return NextResponse.json(bill);
  } catch (err) {
    console.error("PUT /api/purchase-bills/[id] error:", err);
    return NextResponse.json({ error: "Failed to update bill" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    // Reverse the stock this bill added at creation — and guard against a
    // repeated delete call double-reversing it.
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.purchaseBill.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) return null;

      const items = await tx.purchaseBillItem.findMany({
        where: { purchaseBillId: id },
        select: { productId: true, quantity: true },
      });
      const bill = await tx.purchaseBill.findUnique({ where: { id }, select: { billNumber: true } });
      for (const item of items.filter(i => i.productId)) {
        const product = await tx.product.update({
          where: { id: item.productId! },
          data: { stock: { decrement: item.quantity } },
          select: { id: true, stock: true },
        });
        await recordStockMovement(tx, {
          productId: product.id,
          type: "adjustment",
          quantity: -item.quantity,
          balanceAfter: product.stock,
          reference: bill?.billNumber,
          purchaseBillId: id,
          notes: "Purchase bill deleted",
          createdByUserId: session.user.id,
        });
      }
      return bill;
    }, { timeout: 20000, maxWait: 10000 });

    if (!result) return NextResponse.json({ message: "Bill already deleted" });

    await logActivity(session.user.id, "delete_purchase_bill", `Deleted purchase bill ${result.billNumber}`, id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Bill deleted" });
  } catch (err) {
    console.error("DELETE /api/purchase-bills/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
