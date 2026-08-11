import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { deleteAttachmentBlob, isPurchaseBillBlobUrl } from "@/lib/blobStorage";
import { computeRoundOff } from "@/lib/roundOff";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { purchaseBillLineBreakdown } from "@/lib/purchaseBillForm";
import { getBusinessSettings } from "@/lib/db";
import { deriveIsInterState } from "@/lib/gstLocation";
import { isFutureIstDate } from "@/lib/validation";
import { getIndianFinancialYear } from "@/lib/documentNumbering";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, phone: true, email: true, gstin: true, address: true, state: true, updatedAt: true } },
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
    const { vendorId, billDate, dueDate, discount, notes, category, status, items, attachmentUrl, attachmentName, expectedUpdatedAt, transportCharge, transportChargeGstRate } = body;

    if (attachmentUrl && !isPurchaseBillBlobUrl(attachmentUrl)) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    const existing = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This purchase bill was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    if (
      (items !== undefined || discount !== undefined) &&
      (existing.status === "paid" || existing.status === "cancelled")
    ) {
      return NextResponse.json(
        { error: `Items and discount on a ${existing.status} bill cannot be edited.` },
        { status: 400 }
      );
    }

    // Bill date is editable (e.g. correcting a same-week typo), but never
    // across a financial-year boundary — the bill number was generated for
    // a specific FY (see src/lib/documentNumbering.ts) and moving the date
    // into a different one would leave the printed number pointing at the
    // wrong period with no way to reconcile it automatically.
    let parsedBillDate: Date | undefined;
    if (billDate) {
      parsedBillDate = new Date(billDate);
      if (isNaN(parsedBillDate.getTime())) {
        return NextResponse.json({ error: "Invalid bill date" }, { status: 400 });
      }
      if (isFutureIstDate(billDate)) {
        return NextResponse.json({ error: "Bill date cannot be in the future" }, { status: 400 });
      }
      if (getIndianFinancialYear(parsedBillDate) !== getIndianFinancialYear(new Date(existing.billDate))) {
        return NextResponse.json({ error: "Bill date cannot be moved into a different financial year — it would no longer match the bill number. Delete and re-create the bill instead if it truly belongs to a different year." }, { status: 400 });
      }
    }

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const effectiveBillDate = parsedBillDate ?? existing.billDate;
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
      productId?: string; name: string; quantity: number; hsn: string;
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
        productId?: string; name: string; quantity: number; hsn?: string;
        unit?: string; purchasePrice: number; gstRate?: number; discountPercent?: number;
      }[]).map((item) => {
        const quantity = parseFloat(String(item.quantity));
        const purchasePrice = parseFloat(String(item.purchasePrice));
        const gstRate = parseFloat(String(item.gstRate ?? 0));
        const discountPercent = parseFloat(String(item.discountPercent ?? 0));
        const { discountAmount, gstAmount, total, subtotal: itemSubtotal } =
          purchaseBillLineBreakdown(quantity, purchasePrice, gstRate, discountPercent);
        return { ...item, quantity, purchasePrice, gstRate, discountPercent, discountAmount, gstAmount, total, itemSubtotal, hsn: item.hsn ?? "" };
      });
      subtotal = computedItems.reduce((s, i) => s + i.itemSubtotal, 0);
      taxAmount = computedItems.reduce((s, i) => s + i.gstAmount, 0);
    }

    // Re-derive the GST type on every edit (cheap, and keeps it correct if
    // the vendor was switched or the vendor's own state was corrected after
    // this bill was created) — same reasoning as the POST route.
    const effectiveVendorId = vendorId || existing.vendorId;
    const effectiveVendor = await prisma.vendor.findUnique({ where: { id: effectiveVendorId }, select: { state: true } });
    const biz = await getBusinessSettings();
    const derivedIsInterState = deriveIsInterState(effectiveVendor?.state ?? "", biz.state);
    const isInterState = derivedIsInterState ?? false;
    const effectiveTaxAmount = taxAmount !== undefined ? taxAmount : existing.taxAmount;
    const cgst = isInterState ? 0 : effectiveTaxAmount / 2;
    const sgst = isInterState ? 0 : effectiveTaxAmount / 2;
    const igst = isInterState ? effectiveTaxAmount : 0;

    const parsedDiscount = discount !== undefined && discount !== null && discount !== ""
      ? parseFloat(String(discount))
      : undefined;
    if (parsedDiscount !== undefined && (Number.isNaN(parsedDiscount) || parsedDiscount < 0)) {
      return NextResponse.json({ error: "Discount cannot be negative" }, { status: 400 });
    }
    const effectiveDiscount = parsedDiscount !== undefined ? parsedDiscount : existing.discount;

    // Transport/freight charge — same "only touch what was sent" partial-
    // update semantics as discount above, own line/GST kept out of the
    // CGST/SGST/IGST split, always server-recomputed rather than trusted.
    const parsedTransportCharge = transportCharge !== undefined && transportCharge !== null && transportCharge !== ""
      ? parseFloat(String(transportCharge))
      : undefined;
    if (parsedTransportCharge !== undefined && (Number.isNaN(parsedTransportCharge) || parsedTransportCharge < 0)) {
      return NextResponse.json({ error: "Transport charge cannot be negative" }, { status: 400 });
    }
    const effectiveTransportCharge = parsedTransportCharge !== undefined ? parsedTransportCharge : existing.transportCharge;

    const parsedTransportGstRate = transportChargeGstRate !== undefined && transportChargeGstRate !== null && transportChargeGstRate !== ""
      ? parseFloat(String(transportChargeGstRate))
      : undefined;
    if (parsedTransportGstRate !== undefined && (Number.isNaN(parsedTransportGstRate) || parsedTransportGstRate < 0)) {
      return NextResponse.json({ error: "Transport charge GST rate cannot be negative" }, { status: 400 });
    }
    const effectiveTransportGstRate = parsedTransportGstRate !== undefined ? parsedTransportGstRate : existing.transportChargeGstRate;
    const effectiveTransportGstAmount = (effectiveTransportCharge * effectiveTransportGstRate) / 100;

    const rawTotal = (subtotal !== undefined && taxAmount !== undefined
      ? subtotal + taxAmount - effectiveDiscount
      : existing.subtotal + existing.taxAmount - effectiveDiscount) + effectiveTransportCharge + effectiveTransportGstAmount;
    const { roundOff, roundedTotal: total } = computeRoundOff(rawTotal);

    if (total < 0) {
      return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 });
    }

    // Status isn't a free-form field the user picks — it's derived from
    // paidAmount vs total, the same way invoices work, so editing anything
    // that changes total (items or the bill-level discount) can never leave
    // a stale status behind. The one status a user DOES set directly is
    // "cancelled", via the dedicated Cancel Bill action, which calls this
    // route with only `{ status }` and no `items`/`discount` — that explicit
    // value passes through untouched here.
    const totalChanged = items !== undefined || parsedDiscount !== undefined;
    const effectiveStatus = totalChanged
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
          isInterState,
          placeOfSupply: effectiveVendor?.state ?? null,
          cgst,
          sgst,
          igst,
          ...(parsedDiscount !== undefined && { discount: parsedDiscount }),
          ...(parsedTransportCharge !== undefined && { transportCharge: parsedTransportCharge }),
          ...(parsedTransportGstRate !== undefined && { transportChargeGstRate: parsedTransportGstRate }),
          transportChargeGstAmount: effectiveTransportGstAmount,
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
                hsn: item.hsn,
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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const { id } = await params;

    // Deliberately soft-delete only — a bill number is part of the GST
    // filing sequence, so this route never permanently removes the row.
    // Permanent deletion (admin-only, from the Bin page) is a separate,
    // explicit decision — see src/app/api/bin/[type]/[id]/route.ts.
    //
    // Reverse the stock this bill added at creation — and guard against a
    // repeated delete call double-reversing it. A cancelled bill already had
    // its stock reversed when it was cancelled, so deleting it must not
    // reverse it again.
    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, select: { billNumber: true, status: true, deletedAt: true } });
      if (!bill) return null;

      const updateResult = await tx.purchaseBill.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) return { billNumber: bill.billNumber, alreadyDeleted: true };

      if (bill.status !== "cancelled") {
        const items = await tx.purchaseBillItem.findMany({
          where: { purchaseBillId: id },
          select: { productId: true, quantity: true },
        });
        await batchAdjustStock(
          tx,
          items.filter(i => i.productId).map((item) => ({ productId: item.productId!, quantity: -item.quantity })),
          {
            type: "purchase_delete_restore",
            reference: bill.billNumber,
            purchaseBillId: id,
            notes: "Purchase bill deleted",
            createdByUserId: auth.session.user.id,
          }
        );
      }

      return { billNumber: bill.billNumber, alreadyDeleted: false };
    }, { timeout: 20000, maxWait: 10000 });

    if (!result) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (result.alreadyDeleted) return NextResponse.json({ message: "Bill already moved to bin" });

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
