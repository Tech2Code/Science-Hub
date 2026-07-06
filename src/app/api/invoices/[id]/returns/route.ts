import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireSession } from "@/lib/apiAuth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const returns = await prisma.return.findMany({
      where: { invoiceId: id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(returns);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch returns" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { items, notes, date } = body as {
      items: { productId: string; name: string; quantity: number; price: number }[];
      notes?: string;
      date?: string;
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: `Invalid quantity for ${item.name}` }, { status: 400 });
      }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    if (invoice.paidAmount <= 0) {
      return NextResponse.json({ error: "No payment received yet. Record a payment before processing a return." }, { status: 400 });
    }

    // Existing returns total
    const existingReturns = await prisma.return.findMany({
      where: { invoiceId: id },
      include: { items: true },
    });
    const existingReturnTotal = existingReturns.reduce(
      (s, r) => s + r.items.reduce((ss, ri) => ss + ri.total, 0), 0
    );
    const newReturnTotal = items.reduce((s, item) => s + item.quantity * item.price, 0);
    const availableForReturn = invoice.paidAmount - existingReturnTotal;

    if (newReturnTotal > availableForReturn + 0.01) {
      return NextResponse.json({
        error: `Return value (₹${newReturnTotal.toFixed(2)}) exceeds available paid amount (₹${availableForReturn.toFixed(2)} remaining after previous returns).`,
      }, { status: 400 });
    }

    // Each returned item's quantity must not exceed what was actually
    // invoiced for that product, net of quantity already returned —
    // otherwise a return could fabricate stock that was never sold.
    const invoicedQtyByProduct = new Map<string, number>();
    for (const it of invoice.items) {
      if (!it.productId) continue;
      invoicedQtyByProduct.set(it.productId, (invoicedQtyByProduct.get(it.productId) ?? 0) + it.quantity);
    }
    const returnedQtyByProduct = new Map<string, number>();
    for (const r of existingReturns) {
      for (const ri of r.items) {
        if (!ri.productId) continue;
        returnedQtyByProduct.set(ri.productId, (returnedQtyByProduct.get(ri.productId) ?? 0) + ri.quantity);
      }
    }
    for (const item of items) {
      if (!item.productId) continue;
      const invoicedQty = invoicedQtyByProduct.get(item.productId) ?? 0;
      const alreadyReturned = returnedQtyByProduct.get(item.productId) ?? 0;
      const remaining = invoicedQty - alreadyReturned;
      if (item.quantity > remaining) {
        return NextResponse.json({
          error: `Cannot return ${item.quantity} of "${item.name}" — only ${remaining} unit(s) remain returnable on this invoice.`,
        }, { status: 400 });
      }
    }

    const ret = await prisma.$transaction(async (tx) => {
      const created = await tx.return.create({
        data: {
          invoiceId: id,
          date: date ? new Date(date) : new Date(),
          notes: notes || null,
          items: {
            create: items.map(item => ({
              productId: item.productId || null,
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              total: item.quantity * item.price,
            })),
          },
        },
        include: { items: true },
      });

      // Restore stock for returned items
      for (const item of items) {
        if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return created;
    });

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const itemSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");
    await logActivity(
      auth.session.user.id,
      "create_return",
      `Return recorded for invoice ${invoice.invoiceNumber} (${invoice.customer.name}) — ${itemSummary}`,
      id,
      "invoice"
    );

    return NextResponse.json(ret, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to record return" }, { status: 500 });
  }
}
