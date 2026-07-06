import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInvoice } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireSession } from "@/lib/apiAuth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { items, notes, dueDate, isInterState, status } = body;

    // Simple status/notes-only update (from payment flow)
    if (!items) {
      const data: Record<string, unknown> = {};
      if (status !== undefined) data.status = status;
      if (notes !== undefined) data.notes = notes;
      const invoice = await prisma.invoice.update({ where: { id }, data });
      revalidateTag("invoices", { expire: 0 });
      revalidateTag("reports", { expire: 0 });
      return NextResponse.json(invoice);
    }

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { paidAmount: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (existing.status === "paid") {
      return NextResponse.json({ error: "A fully paid invoice cannot be edited" }, { status: 400 });
    }

    for (const item of items as { qty?: number; quantity?: number; price: number; gstRate?: number }[]) {
      const quantity = parseFloat(String(item.qty ?? item.quantity ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? 0));
      if (!(quantity > 0)) {
        return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
      }
      if (!(price >= 0)) {
        return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
      }
      if (!(gstRate >= 0)) {
        return NextResponse.json({ error: "Item GST rate cannot be negative" }, { status: 400 });
      }
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

    const { invoice, stockWarnings } = await prisma.$transaction(async (tx) => {
      // Restore stock for old items before replacing them
      const oldItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { productId: true, quantity: true },
      });
      await Promise.all(oldItems.map((old) =>
        tx.product.update({
          where: { id: old.productId },
          data: { stock: { increment: old.quantity } },
        })
      ));

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

      // Deduct stock for new items — update() returns the row directly so we
      // don't need a second round-trip per item to check for negative stock.
      const updatedProducts = await Promise.all(invoiceItems.map((item: { productId: string; quantity: number }) =>
        tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
          select: { name: true, stock: true },
        })
      ));
      const warnings = updatedProducts
        .filter((p) => p.stock < 0)
        .map((p) => `${p.name} (stock: ${p.stock})`);

      return { invoice: inv, stockWarnings: warnings };
    }, { timeout: 20000, maxWait: 10000 });

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const inv = invoice as { invoiceNumber?: string; customer?: { name?: string }; total?: number; items?: unknown[] };
    await logActivity(auth.session.user.id, "update_invoice", `Edited invoice ${inv.invoiceNumber ?? id} for ${inv.customer?.name ?? ""} | Total: ₹${(inv.total ?? 0).toFixed(2)} | Items: ${inv.items?.length ?? 0} | Tax: ${inter ? "IGST" : "CGST+SGST"}`, id, "invoice");
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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // Guard against double-delete (double-click, retry, repeated API call):
    // only restore stock if this call is the one that actually transitions
    // the invoice from active to deleted — updateMany's count tells us that
    // atomically, so a repeat call finds count 0 and skips re-crediting stock.
    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id },
        select: { invoiceNumber: true, total: true, customer: { select: { name: true } } },
      });
      if (!inv) return { found: false, alreadyDeleted: false, inv: null };

      const items = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { productId: true, quantity: true },
      });
      const updateResult = await tx.invoice.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) {
        return { found: true, alreadyDeleted: true, inv };
      }
      await Promise.all(items.map(item =>
        tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } })
      ));
      return { found: true, alreadyDeleted: false, inv };
    });

    if (!result.found) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (result.alreadyDeleted) return NextResponse.json({ message: "Invoice already moved to bin" });

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    if (result.inv) {
      await logActivity(auth.session.user.id, "delete_invoice", `Moved invoice ${result.inv.invoiceNumber} to bin | Customer: ${result.inv.customer?.name ?? "—"} | Total: ₹${result.inv.total.toFixed(2)}`, id, "invoice");
    }
    return NextResponse.json({ message: "Invoice moved to bin" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
