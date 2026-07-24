import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { deleteAttachmentBlob, isPurchaseBillBlobUrl } from "@/lib/blobStorage";
import { computeRoundOff } from "@/lib/roundOff";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { purchaseBillLineBreakdown } from "@/lib/purchaseBillForm";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, phone: true, email: true, gstin: true, address: true } },
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  payments: { orderBy: { date: "desc" as const } },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
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
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await req.json();
    const { vendorId, billDate, dueDate, discount, notes, category, status, items, attachmentUrl, attachmentName, expectedUpdatedAt } = body;

    if (attachmentUrl && !isPurchaseBillBlobUrl(attachmentUrl)) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    const existing = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This purchase bill was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

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
        const { discountAmount, gstAmount, total, subtotal: itemSubtotal } =
          purchaseBillLineBreakdown(quantity, purchasePrice, gstRate, discountPercent);
        return { ...item, quantity, purchasePrice, gstRate, discountPercent, discountAmount, gstAmount, total, itemSubtotal };
      });
      subtotal = computedItems.reduce((s, i) => s + i.itemSubtotal, 0);
      taxAmount = computedItems.reduce((s, i) => s + i.gstAmount, 0);
    }

    const effectiveDiscount = discount !== undefined ? discount : existing.discount;
    const rawTotal = subtotal !== undefined && taxAmount !== undefined
      ? subtotal + taxAmount - effectiveDiscount
      : existing.subtotal + existing.taxAmount - effectiveDiscount;
    const { roundOff, roundedTotal: total } = computeRoundOff(rawTotal);

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
        await batchAdjustStock(
          tx,
          oldItems.filter(i => i.productId).map((old) => ({ productId: old.productId!, quantity: -old.quantity })),
          {
            type: "purchase_edit_reverse",
            reference: existing.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill edited — old items reversed",
            createdByUserId: auth.session.user.id,
          }
        );
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
          roundOff,
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
        await batchAdjustStock(
          tx,
          computedItems.filter(item => item.productId).map((item) => ({ productId: item.productId!, quantity: item.quantity })),
          {
            type: "purchase_edit_apply",
            reference: updated.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill edited — new items applied",
            createdByUserId: auth.session.user.id,
          }
        );
      }

      if (isCancelling || isUncancelling) {
        const currentItems = await tx.purchaseBillItem.findMany({
          where: { purchaseBillId: id },
          select: { productId: true, quantity: true },
        });
        await batchAdjustStock(
          tx,
          currentItems.filter(i => i.productId).map((item) => ({
            productId: item.productId!,
            quantity: isCancelling ? -item.quantity : item.quantity,
          })),
          {
            type: isCancelling ? "purchase_cancel" : "purchase_uncancel",
            reference: updated.billNumber,
            purchaseBillId: id,
            notes: isCancelling ? "Purchase bill cancelled" : "Purchase bill un-cancelled",
            createdByUserId: auth.session.user.id,
          }
        );
      }

      return updated;
    }, { timeout: 20000, maxWait: 10000 });

    // Attachment was replaced or removed — the old blob is now orphaned.
    if (attachmentUrl !== undefined && existing.attachmentUrl && existing.attachmentUrl !== attachmentUrl) {
      await deleteAttachmentBlob(existing.attachmentUrl);
    }

    await logActivity(auth.session.user.id, "update_purchase_bill", `Updated purchase bill ${bill.billNumber}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    if (isCancelling || isUncancelling || items !== undefined) {
      revalidateTag("products", { expire: 0 });
      revalidateTag("reports", { expire: 0 });
    }
    return NextResponse.json(bill);
  } catch (err) {
    console.error("PUT /api/purchase-bills/[id] error:", err);
    if (err instanceof ProductNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update bill" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const { id } = await params;

    // Reverse the stock this bill added at creation — and guard against a
    // repeated delete call double-reversing it. A cancelled bill already had
    // its stock reversed when it was cancelled, so deleting it must not
    // reverse it again.
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.purchaseBill.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) return null;

      const bill = await tx.purchaseBill.findUnique({ where: { id }, select: { billNumber: true, status: true } });
      if (bill?.status !== "cancelled") {
        const items = await tx.purchaseBillItem.findMany({
          where: { purchaseBillId: id },
          select: { productId: true, quantity: true },
        });
        await batchAdjustStock(
          tx,
          items.filter(i => i.productId).map((item) => ({ productId: item.productId!, quantity: -item.quantity })),
          {
            type: "purchase_delete_restore",
            reference: bill?.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill deleted",
            createdByUserId: auth.session.user.id,
          }
        );
      }
      return bill;
    }, { timeout: 20000, maxWait: 10000 });

    if (!result) return NextResponse.json({ message: "Bill already deleted" });

    await logActivity(auth.session.user.id, "delete_purchase_bill", `Deleted purchase bill ${result.billNumber}`, id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Bill deleted" });
  } catch (err) {
    console.error("DELETE /api/purchase-bills/[id] error:", err);
    if (err instanceof ProductNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
