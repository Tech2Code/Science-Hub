import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvoice } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { items, notes, dueDate, isInterState, status } = body;

    // Simple status/notes-only update (from payment flow)
    if (!items) {
      const data: Record<string, unknown> = {};
      if (status !== undefined) data.status = status;
      if (notes !== undefined) data.notes = notes;
      const invoice = await prisma.invoice.update({ where: { id }, data });
      return NextResponse.json(invoice);
    }

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { paidAmount: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    // Fetch product info for names/units
    const productIds = items.map((i: { productId: string }) => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let totalGst = 0;

    const invoiceItems = items.map((item: {
      productId: string; qty?: number; quantity?: number;
      price: number; gstRate: number; unit?: string;
    }) => {
      const product = productMap.get(item.productId);
      const quantity = parseFloat(String(item.qty ?? item.quantity ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? product?.gstRate ?? 18));
      const itemSubtotal = price * quantity;
      const gstAmount = (itemSubtotal * gstRate) / 100;
      subtotal += itemSubtotal;
      totalGst += gstAmount;
      return {
        productId: item.productId,
        name: product?.name ?? "Unknown Product",
        quantity,
        unit: item.unit ?? product?.unit ?? "Nos",
        price,
        gstRate,
        gstAmount,
        total: itemSubtotal + gstAmount,
      };
    });

    const inter = Boolean(isInterState);
    const cgst = inter ? 0 : totalGst / 2;
    const sgst = inter ? 0 : totalGst / 2;
    const igst = inter ? totalGst : 0;
    const total = subtotal + totalGst;

    // Recalculate status based on paidAmount
    const paidAmount = existing.paidAmount;
    let newStatus = "unpaid";
    if (paidAmount >= total) newStatus = "paid";
    else if (paidAmount > 0) newStatus = "partial";

    const session = await getServerSession(authOptions);
    void session; // used for auth check in production

    const { invoice, stockWarnings } = await prisma.$transaction(async (tx) => {
      // Restore stock for old items before replacing them
      const oldItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { productId: true, quantity: true },
      });
      for (const old of oldItems) {
        await tx.product.updateMany({
          where: { id: old.productId },
          data: { stock: { increment: old.quantity } },
        });
      }

      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      const inv = await tx.invoice.update({
        where: { id },
        data: {
          isInterState: inter,
          dueDate: dueDate ? new Date(dueDate) : null,
          notes: notes ?? null,
          subtotal,
          cgst,
          sgst,
          igst,
          total,
          status: newStatus,
          items: { create: invoiceItems },
        },
        include: { items: true, customer: true },
      });

      // Deduct stock for new items
      const warnings: string[] = [];
      for (const item of invoiceItems) {
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        const prod = await tx.product.findUnique({
          where: { id: item.productId },
          select: { name: true, stock: true },
        });
        if (prod && prod.stock < 0) {
          warnings.push(`${prod.name} (stock: ${prod.stock})`);
        }
      }

      return { invoice: inv, stockWarnings: warnings };
    });

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const sess = await getServerSession(authOptions);
    if (sess?.user?.id) {
      const inv = invoice as { invoiceNumber?: string; customer?: { name?: string }; total?: number; items?: unknown[] };
      await logActivity(sess.user.id, "update_invoice", `Edited invoice ${inv.invoiceNumber ?? id} for ${inv.customer?.name ?? ""} | Total: ₹${(inv.total ?? 0).toFixed(2)} | Items: ${inv.items?.length ?? 0} | Tax: ${inter ? "IGST" : "CGST+SGST"}`, id, "invoice");
    }
    return NextResponse.json({ ...invoice, stockWarnings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sess = await getServerSession(authOptions);
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { invoiceNumber: true, total: true, customer: { select: { name: true } } } });

    // Restore stock before soft-deleting
    const items = await prisma.invoiceItem.findMany({
      where: { invoiceId: id },
      select: { productId: true, quantity: true },
    });
    await prisma.$transaction([
      ...items.map(item =>
        prisma.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        })
      ),
      prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    if (sess?.user?.id && inv) {
      await logActivity(sess.user.id, "delete_invoice", `Moved invoice ${inv.invoiceNumber} to bin | Customer: ${inv.customer?.name ?? "—"} | Total: ₹${inv.total.toFixed(2)}`, id, "invoice");
    }
    return NextResponse.json({ message: "Invoice moved to bin" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
