import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

type BinType = "invoice" | "customer" | "product" | "brand" | "category";

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
  }
}

// POST — restore
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
          await Promise.all(invItems.map(item =>
            tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } })
          ));
          return true;
        });
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
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (session.user?.id) {
      await logActivity(session.user.id, `restore_${binType}`, `Restored ${binType} "${name}" from bin`, id, binType);
    }

    return NextResponse.json({ message: "Restored" });
  } catch (error) {
    console.error("POST /api/bin/[type]/[id] error:", error);
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

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
        // Check if invoiceItems reference this product
        const itemCount = await prisma.invoiceItem.count({ where: { productId: id } });
        if (itemCount > 0) {
          return NextResponse.json(
            { error: `Cannot permanently delete "${name}" — it appears in ${itemCount} invoice line item(s).` },
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
