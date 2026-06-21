import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { getInvoice } from "@/lib/db";

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

    // Full invoice edit — only allowed when invoice has no payments (unpaid)
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { paidAmount: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (existing.status === "paid") {
      return NextResponse.json({ error: "Paid invoices cannot be edited." }, { status: 400 });
    }

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

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
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
    });

    revalidateTag(`invoice-${id}`, { expire: 0 });
    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(invoice);
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
    await prisma.invoice.delete({ where: { id } });
    revalidateTag(`invoice-${id}`, { expire: 0 });
    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Invoice deleted" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
