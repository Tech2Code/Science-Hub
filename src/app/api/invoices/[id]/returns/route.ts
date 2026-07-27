import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { isFutureIstDate } from "@/lib/validation";
import { lineBreakdown } from "@/lib/invoiceCalc";
import { computeRoundOff } from "@/lib/roundOff";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const returns = await prisma.return.findMany({
      where: { invoiceId: id, deletedAt: null },
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
    const auth = await requireWriteAccess();
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
      if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0) {
        return NextResponse.json({ error: `Invalid price for ${item.name}` }, { status: 400 });
      }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    // Narrowed local bindings — TS control-flow narrowing on `invoice`/`auth`
    // (both nullable/union types above) doesn't carry into the nested
    // `attemptCreate` function declaration below, the same reason the
    // invoice/purchase-bill creation routes extract `user` up front.
    const inv = invoice;
    const userId = auth.session.user.id;

    if (invoice.paidAmount <= 0) {
      return NextResponse.json({ error: "No payment received yet. Record a payment before processing a return." }, { status: 400 });
    }

    let returnDate = new Date();
    if (date) {
      returnDate = new Date(date);
      if (isNaN(returnDate.getTime())) {
        return NextResponse.json({ error: "Invalid return date" }, { status: 400 });
      }
      if (returnDate < invoice.date) {
        return NextResponse.json({ error: "Return date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Return date cannot be in the future" }, { status: 400 });
      }
    }

    // Each returned line's GST rate is inherited from the matching product on
    // the original invoice — a credit note can't invent its own rate. Falls
    // back to the invoice's blended effective rate only for the defensive
    // case of a returned line whose product isn't on the invoice at all.
    const rateByProduct = new Map(invoice.items.map((it) => [it.productId, it.gstRate]));
    const effectiveRate = invoice.subtotal > 0 ? ((invoice.cgst + invoice.sgst + invoice.igst) / invoice.subtotal) * 100 : 0;

    const computedItems = items.map((item) => {
      const gstRate = (item.productId ? rateByProduct.get(item.productId) : undefined) ?? effectiveRate;
      const { taxable, gstAmt, total } = lineBreakdown({ qty: item.quantity, price: item.price, gstRate, discountPercent: 0 });
      return { ...item, gstRate, taxable, gstAmt, total };
    });

    const subtotal = computedItems.reduce((s, i) => s + i.taxable, 0);
    const totalGst = computedItems.reduce((s, i) => s + i.gstAmt, 0);
    const cgst = invoice.isInterState ? 0 : totalGst / 2;
    const sgst = invoice.isInterState ? 0 : totalGst / 2;
    const igst = invoice.isInterState ? totalGst : 0;
    const { roundOff, roundedTotal: creditNoteTotal } = computeRoundOff(subtotal + totalGst);

    // Credit note numbering follows the same pattern as invoice/purchase-bill
    // numbering: highest-existing-number-for-year + 1, generated inside the
    // same Serializable transaction as the write, with a retry on the
    // write-conflict Postgres reports (P2034) when two requests race.
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        const existingReturns = await tx.return.findMany({
          where: { invoiceId: id, deletedAt: null },
          include: { items: true },
        });
        // GST-inclusive value, matching what the customer was actually paid/owed —
        // capping against paidAmount on the ex-GST value alone would let more be
        // refunded than the customer ever paid.
        const existingReturnTotal = existingReturns.reduce((s, r) => s + r.total, 0);
        const newReturnTotal = creditNoteTotal;
        const availableForReturn = inv.paidAmount - existingReturnTotal;

        if (newReturnTotal > availableForReturn + 0.01) {
          throw new ReturnValidationError(
            `Return value (₹${newReturnTotal.toFixed(2)}) exceeds available paid amount (₹${availableForReturn.toFixed(2)} remaining after previous returns).`
          );
        }

        // Each returned item's quantity must not exceed what was actually
        // invoiced for that product, net of quantity already returned —
        // otherwise a return could fabricate stock that was never sold.
        const invoicedQtyByProduct = new Map<string, number>();
        for (const it of inv.items) {
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
            throw new ReturnValidationError(
              `Cannot return ${item.quantity} of "${item.name}" — only ${remaining} unit(s) remain returnable on this invoice.`
            );
          }
        }

        const year = returnDate.getFullYear();
        const lastThisYear = await tx.return.findFirst({
          where: { creditNoteNumber: { startsWith: `CN-${year}-` } },
          orderBy: { creditNoteNumber: "desc" },
          select: { creditNoteNumber: true },
        });
        const lastSequential = lastThisYear?.creditNoteNumber
          ? parseInt(lastThisYear.creditNoteNumber.split("-")[2], 10)
          : 0;
        const creditNoteNumber = `CN-${year}-${String(lastSequential + 1).padStart(4, "0")}`;

        const created = await tx.return.create({
          data: {
            invoiceId: id,
            creditNoteNumber,
            date: returnDate,
            notes: notes || null,
            subtotal, cgst, sgst, igst, roundOff, total: creditNoteTotal,
            items: {
              create: computedItems.map((item) => ({
                productId: item.productId || null,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                gstRate: item.gstRate,
                gstAmount: item.gstAmt,
                total: item.total,
              })),
            },
          },
          include: { items: true },
        });

        // Restore stock for returned items
        await batchAdjustStock(
          tx,
          items.filter((item) => item.productId).map((item) => ({ productId: item.productId!, quantity: item.quantity })),
          { type: "return", reference: inv.invoiceNumber, createdByUserId: userId }
        );

        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
    }

    const maxAttempts = 5;
    let ret: Awaited<ReturnType<typeof attemptCreate>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        ret = await attemptCreate();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const itemSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");
    await logActivity(
      auth.session.user.id,
      "create_return",
      `Credit note ${ret!.creditNoteNumber} recorded for invoice ${invoice.invoiceNumber} (${invoice.customer.name}) — ${itemSummary} | Total: ₹${creditNoteTotal.toFixed(2)}`,
      id,
      "invoice"
    );

    return NextResponse.json(ret, { status: 201 });
  } catch (error) {
    if (error instanceof ReturnValidationError || error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to record return" }, { status: 500 });
  }
}

class ReturnValidationError extends Error {}
