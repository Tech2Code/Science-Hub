import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { deleteAttachmentBlob } from "@/lib/blobStorage";
import { requireSession, requireAdmin } from "@/lib/apiAuth";

type BinType = "invoice" | "customer" | "product" | "brand" | "category" | "vendor" | "purchase_bill";

async function getItemName(type: BinType, id: string): Promise<string> {
  switch (type) {
    case "invoice": {
      const inv = await prisma.invoice.findUnique({ where: { id }, select: { invoiceNumber: true } });
      return inv?.invoiceNumber ?? id;
    }
    case "customer": {
      const c = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
      return c?.name ?? id;
    }
    case "product": {
      const p = await prisma.product.findUnique({ where: { id }, select: { name: true } });
      return p?.name ?? id;
    }
    case "brand": {
      const b = await prisma.brand.findUnique({ where: { id }, select: { name: true } });
      return b?.name ?? id;
    }
    case "category": {
      const cat = await prisma.category.findUnique({ where: { id }, select: { name: true } });
      return cat?.name ?? id;
    }
    case "vendor": {
      const v = await prisma.vendor.findUnique({ where: { id }, select: { name: true } });
      return v?.name ?? id;
    }
    case "purchase_bill": {
      const b = await prisma.purchaseBill.findUnique({ where: { id }, select: { billNumber: true } });
      return b?.billNumber ?? id;
    }
  }
}

// POST — restore
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const binType = type as BinType;
    const name = await getItemName(binType, id);

    switch (binType) {
      case "invoice": {
        // Guard against double-restore: only re-deduct stock if this call is
        // the one that actually transitions deletedAt from set to null.
        const restored = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.invoice.updateMany({
            where: { id, deletedAt: { not: null } },
            data: { deletedAt: null },
          });
          if (updateResult.count === 0) return false;
          const invItems = await tx.invoiceItem.findMany({
            where: { invoiceId: id },
            select: { productId: true, quantity: true },
          });
          await batchAdjustStock(
            tx,
            invItems.map((item) => ({ productId: item.productId, quantity: -item.quantity })),
            { type: "adjustment", reference: name, notes: "Invoice restored from bin", createdByUserId: session.user?.id }
          );
          return true;
        }, { timeout: 20000, maxWait: 10000 });
        if (!restored) return NextResponse.json({ message: "Already restored" });
        revalidateTag("invoices", { expire: 0 });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      case "customer":
        await prisma.customer.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("customers", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "product":
        await prisma.product.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "brand":
        await prisma.brand.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "category":
        await prisma.category.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "vendor":
        await prisma.vendor.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("vendors", { expire: 0 });
        break;
      case "purchase_bill": {
        // Guard against double-restore, symmetric to the invoice case above.
        // A cancelled bill's stock was already reversed at cancel-time, so
        // restoring it from the bin must not re-apply it again.
        const restored = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.purchaseBill.updateMany({
            where: { id, deletedAt: { not: null } },
            data: { deletedAt: null },
          });
          if (updateResult.count === 0) return false;
          const bill = await tx.purchaseBill.findUnique({ where: { id }, select: { status: true } });
          if (bill?.status !== "cancelled") {
            const billItems = await tx.purchaseBillItem.findMany({
              where: { purchaseBillId: id },
              select: { productId: true, quantity: true },
            });
            await batchAdjustStock(
              tx,
              billItems.filter(i => i.productId).map((item) => ({ productId: item.productId!, quantity: item.quantity })),
              { type: "purchase", reference: name, purchaseBillId: id, notes: "Purchase bill restored from bin", createdByUserId: session.user?.id }
            );
          }
          return true;
        }, { timeout: 20000, maxWait: 10000 });
        if (!restored) return NextResponse.json({ message: "Already restored" });
        revalidateTag("purchase-bills", { expire: 0 });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (session.user?.id) {
      await logActivity(session.user.id, `restore_${binType}`, `Restored ${binType} "${name}" from bin`, id, binType);
    }

    return NextResponse.json({ message: "Restored" });
  } catch (error) {
    console.error("POST /api/bin/[type]/[id] error:", error);
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to restore item" }, { status: 500 });
  }
}

// DELETE — permanent delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const binType = type as BinType;
    const name = await getItemName(binType, id);

    switch (binType) {
      case "invoice":
        // Prisma cascade handles items/payments
        await prisma.invoice.delete({ where: { id } });
        revalidateTag("invoices", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "customer": {
        // Check for ANY invoices referencing this customer, active or
        // soft-deleted — the FK constraint blocks the delete either way, so
        // a soft-deleted invoice left unpurged would otherwise crash this
        // with a raw, unexplained 500.
        const invoiceCount = await prisma.invoice.count({
          where: { customerId: id },
        });
        if (invoiceCount > 0) {
          return NextResponse.json(
            { error: `Cannot permanently delete "${name}" — they have ${invoiceCount} invoice(s) on record (including any in the bin). Permanently delete those invoices first.` },
            { status: 400 }
          );
        }
        await prisma.customer.delete({ where: { id } });
        revalidateTag("customers", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      case "product": {
        // Check every FK that references this product without cascading —
        // any of these would otherwise crash the delete with a raw,
        // unexplained 500 instead of a clear message. StockMovement is not
        // checked here — its product relation is nullable with onDelete:
        // SetNull, so those ledger rows survive (with a productName
        // snapshot) instead of blocking the delete.
        const [itemCount, purchaseItemCount] = await Promise.all([
          prisma.invoiceItem.count({ where: { productId: id } }),
          prisma.purchaseBillItem.count({ where: { productId: id } }),
        ]);
        if (itemCount > 0) {
          return NextResponse.json(
            { error: `Cannot permanently delete "${name}" — it appears in ${itemCount} invoice line item(s) (including any in the bin).` },
            { status: 400 }
          );
        }
        if (purchaseItemCount > 0) {
          return NextResponse.json(
            { error: `Cannot permanently delete "${name}" — it appears in ${purchaseItemCount} purchase bill line item(s) (including any in the bin).` },
            { status: 400 }
          );
        }
        await prisma.product.delete({ where: { id } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      case "brand":
        await prisma.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
        await prisma.brand.delete({ where: { id } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "category":
        await prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
        await prisma.category.delete({ where: { id } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "vendor": {
        // Check for ANY purchase bills referencing this vendor, active or
        // soft-deleted — the FK constraint blocks the delete either way.
        const billCount = await prisma.purchaseBill.count({ where: { vendorId: id } });
        if (billCount > 0) {
          return NextResponse.json(
            { error: `Cannot permanently delete "${name}" — they have ${billCount} purchase bill(s) on record (including any in the bin). Permanently delete those bills first.` },
            { status: 400 }
          );
        }
        await prisma.vendor.delete({ where: { id } });
        revalidateTag("vendors", { expire: 0 });
        break;
      }
      case "purchase_bill": {
        const toDelete = await prisma.purchaseBill.findUnique({ where: { id }, select: { attachmentUrl: true } });
        // Prisma cascade handles items/payments
        await prisma.purchaseBill.delete({ where: { id } });
        await deleteAttachmentBlob(toDelete?.attachmentUrl);
        revalidateTag("purchase-bills", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (session.user?.id) {
      await logActivity(session.user.id, `permanent_delete_${binType}`, `Permanently deleted ${binType} "${name}"`, id, binType);
    }

    return NextResponse.json({ message: "Permanently deleted" });
  } catch (error) {
    console.error("DELETE /api/bin/[type]/[id] error:", error);
    return NextResponse.json({ error: "Failed to permanently delete item" }, { status: 500 });
  }
}
