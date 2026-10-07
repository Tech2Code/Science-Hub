import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { deleteAttachmentBlob } from "@/lib/blobStorage";
import { requireWriteAccess, requireAdmin } from "@/lib/apiAuth";

type BinType = "invoice" | "customer" | "product" | "brand" | "category" | "vendor" | "purchase_bill" | "return" | "rate_list";

// Thrown from inside a restore transaction for a plain validation failure (400 unless overridden).
class BinValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

// Permanent delete is only ever allowed on a row that's actually in the bin — without this, the
// admin-only DELETE route could hard-delete a live invoice/bill/credit note (a GST sequence gap)
// just by calling it directly with that row's id.
async function getBinState(type: BinType, id: string): Promise<{ deletedAt: Date | null } | null> {
  const select = { deletedAt: true } as const;
  switch (type) {
    case "invoice": return prisma.invoice.findUnique({ where: { id }, select });
    case "customer": return prisma.customer.findUnique({ where: { id }, select });
    case "product": return prisma.product.findUnique({ where: { id }, select });
    case "brand": return prisma.brand.findUnique({ where: { id }, select });
    case "category": return prisma.category.findUnique({ where: { id }, select });
    case "vendor": return prisma.vendor.findUnique({ where: { id }, select });
    case "purchase_bill": return prisma.purchaseBill.findUnique({ where: { id }, select });
    case "return": return prisma.return.findUnique({ where: { id }, select });
    case "rate_list": return prisma.rateList.findUnique({ where: { id }, select });
  }
}

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
    case "return": {
      const r = await prisma.return.findUnique({ where: { id }, select: { creditNoteNumber: true } });
      return r?.creditNoteNumber ?? id;
    }
    case "rate_list": {
      const r = await prisma.rateList.findUnique({ where: { id }, select: { title: true } });
      return r?.title ?? id;
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
    const auth = await requireWriteAccess();
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
            invItems.filter((item) => item.productId).map((item) => ({ productId: item.productId!, quantity: -item.quantity })),
            { type: "sale_bin_restore", reference: name, notes: "Invoice restored from bin", createdByUserId: session.user?.id }
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
      case "product": {
        const duplicate = await prisma.product.findFirst({
          where: { name: { equals: name, mode: "insensitive" }, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) {
          return NextResponse.json({ error: `A product named "${name}" already exists — rename or remove it before restoring this one` }, { status: 409 });
        }
        await prisma.product.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
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
        // Double-restore guard, symmetric to invoice. A cancelled bill's stock was already
        // reversed at cancel-time, so restoring must not re-apply it.
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
              { type: "purchase_bin_restore", reference: name, purchaseBillId: id, notes: "Purchase bill restored from bin", createdByUserId: session.user?.id }
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
      case "return": {
        // Double-restore guard — re-apply the credit note's stock effect only on the restoring call.
        // Serializable + P2034 retry, and the same remaining-quantity / paid-amount caps
        // POST /api/invoices/[id]/returns enforces: while this credit note sat in the bin, the
        // invoice could have been edited, had payments removed, or had other credit notes issued,
        // so bringing it back unchecked could over-credit the invoice or fabricate stock.
        const attemptRestore = () => prisma.$transaction(async (tx) => {
          const ret = await tx.return.findUnique({
            where: { id },
            select: { deletedAt: true, total: true, invoiceId: true, items: { select: { productId: true, name: true, quantity: true } } },
          });
          if (!ret) throw new BinValidationError("Credit note not found", 404);
          if (!ret.deletedAt) return false;

          const invoice = await tx.invoice.findUniqueOrThrow({
            where: { id: ret.invoiceId },
            select: { deletedAt: true, paidAmount: true, invoiceNumber: true, items: { select: { productId: true, name: true, quantity: true } } },
          });
          if (invoice.deletedAt) {
            throw new BinValidationError(`Invoice ${invoice.invoiceNumber} is in the bin — restore the invoice before restoring this credit note.`);
          }

          const otherReturns = await tx.return.findMany({
            where: { invoiceId: ret.invoiceId, deletedAt: null, NOT: { id } },
            select: { total: true, items: { select: { productId: true, name: true, quantity: true } } },
          });

          const otherTotal = otherReturns.reduce((s, r) => s + r.total, 0);
          if (otherTotal + ret.total > invoice.paidAmount + 0.01) {
            throw new BinValidationError(
              `Cannot restore — this credit note (₹${ret.total.toFixed(2)}) would exceed the invoice's paid amount (₹${Math.max(0, invoice.paidAmount - otherTotal).toFixed(2)} remaining after other credit notes).`
            );
          }

          // Catalog lines keyed by productId, custom lines by trimmed lowercase name (same as the returns route).
          const lineKey = (it: { productId: string | null; name: string }) => it.productId ? `p:${it.productId}` : `n:${it.name.trim().toLowerCase()}`;
          const invoiced = new Map<string, number>();
          for (const it of invoice.items) invoiced.set(lineKey(it), (invoiced.get(lineKey(it)) ?? 0) + it.quantity);
          const alreadyReturned = new Map<string, number>();
          for (const r of otherReturns) {
            for (const ri of r.items) alreadyReturned.set(lineKey(ri), (alreadyReturned.get(lineKey(ri)) ?? 0) + ri.quantity);
          }
          const restoring = new Map<string, { quantity: number; name: string }>();
          for (const ri of ret.items) {
            const prev = restoring.get(lineKey(ri));
            restoring.set(lineKey(ri), { quantity: (prev?.quantity ?? 0) + ri.quantity, name: prev?.name ?? ri.name });
          }
          for (const [key, { quantity, name: itemName }] of restoring) {
            const remaining = (invoiced.get(key) ?? 0) - (alreadyReturned.get(key) ?? 0);
            if (quantity > remaining + 1e-9) {
              throw new BinValidationError(
                `Cannot restore — "${itemName}" has only ${Math.max(0, remaining)} unit(s) left returnable on invoice ${invoice.invoiceNumber}, but this credit note returns ${quantity}.`
              );
            }
          }

          const updateResult = await tx.return.updateMany({
            where: { id, deletedAt: { not: null } },
            data: { deletedAt: null },
          });
          if (updateResult.count === 0) return false;
          await batchAdjustStock(
            tx,
            ret.items.filter((i) => i.productId).map((item) => ({ productId: item.productId!, quantity: item.quantity })),
            { type: "return_bin_restore", reference: name, notes: "Credit note restored from bin", createdByUserId: session.user?.id }
          );
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });

        const maxAttempts = 5;
        let restored = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            restored = await attemptRestore();
            break;
          } catch (error) {
            const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
            if (isWriteConflict && attempt < maxAttempts) continue;
            throw error;
          }
        }
        if (!restored) return NextResponse.json({ message: "Already restored" });
        revalidateTag("invoices", { expire: 0 });
        revalidateTag("products", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      }
      case "rate_list":
        await prisma.rateList.update({ where: { id }, data: { deletedAt: null } });
        revalidateTag("rate-lists", { expire: 0 });
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (session.user?.id) {
      await logActivity(session.user.id, `restore_${binType}`, `Restored ${binType} "${name}" from bin`, id, binType);
    }

    return NextResponse.json({ message: "Restored" });
  } catch (error) {
    if (error instanceof BinValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
    const validTypes: BinType[] = ["invoice", "customer", "product", "brand", "category", "vendor", "purchase_bill", "return", "rate_list"];
    if (!validTypes.includes(binType)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const binState = await getBinState(binType, id);
    if (!binState) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (!binState.deletedAt) {
      return NextResponse.json({ error: "Only items in the bin can be permanently deleted" }, { status: 400 });
    }
    const name = await getItemName(binType, id);

    switch (binType) {
      case "invoice":
        // Prisma cascade handles items/payments
        await prisma.invoice.delete({ where: { id } });
        revalidateTag("invoices", { expire: 0 });
        revalidateTag("reports", { expire: 0 });
        break;
      case "customer": {
        // Check ANY invoices (active or soft-deleted) — the FK blocks the delete either way,
        // and an unpurged soft-deleted one would otherwise crash this with a raw 500.
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
        // Check every non-cascading FK referencing this product to avoid a raw 500. StockMovement
        // is skipped — its productId is nullable (onDelete: SetNull), so ledger rows just survive.
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
      case "return":
        // Nothing else references a credit note — cascade handles its items.
        await prisma.return.delete({ where: { id } });
        revalidateTag("reports", { expire: 0 });
        break;
      case "rate_list":
        // Nothing else references a rate list — cascade handles its items.
        await prisma.rateList.delete({ where: { id } });
        revalidateTag("rate-lists", { expire: 0 });
        break;
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
