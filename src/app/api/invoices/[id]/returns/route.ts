import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { isFutureIstDate, toIstDateStr, istDayStartUtc, MAX_MONEY_VALUE } from "@/lib/validation";
import { lineBreakdown } from "@/lib/invoiceCalc";
import { computeRoundOff } from "@/lib/roundOff";
import { getBusinessSettings } from "@/lib/db";
import { computeNextNumber, numberFormatDbFilter, getIndianFinancialYear, formatFinancialYearLabel } from "@/lib/documentNumbering";

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
    const { items, notes, date, idempotencyKey } = body as {
      items: { productId: string; name: string; quantity: number; price: number; discountPercent?: number }[];
      notes?: string;
      date?: string;
      idempotencyKey?: string;
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length > 200)) {
      return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    }
    // A retried/duplicated create submission of the same client-generated key is a no-op —
    // return the credit note that submission already created rather than creating a second one.
    // The key is only globally unique in the DB, not scoped to this invoice, so a match
    // belonging to a DIFFERENT invoice must not be treated as a replay of THIS submission.
    if (idempotencyKey) {
      const existingReturn = await prisma.return.findUnique({ where: { idempotencyKey }, include: { items: true } });
      if (existingReturn && existingReturn.invoiceId === id) {
        return NextResponse.json(existingReturn, { status: 200 });
      } else if (existingReturn) {
        return NextResponse.json({ error: "This idempotency key was already used for a different credit note." }, { status: 409 });
      }
    }
    if (typeof notes === "string" && notes.length > 2000) {
      return NextResponse.json({ error: "Notes is too long (max 2000 characters)." }, { status: 400 });
    }
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: `Invalid quantity for ${item.name}` }, { status: 400 });
      }
      if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 || item.price > MAX_MONEY_VALUE) {
        return NextResponse.json({ error: `Invalid price for ${item.name}` }, { status: 400 });
      }
      if (item.discountPercent !== undefined && (typeof item.discountPercent !== "number" || !Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100)) {
        return NextResponse.json({ error: `Invalid discount for ${item.name}` }, { status: 400 });
      }
    }
    {
      // A product appearing twice in one request would otherwise be checked against the same
      // static "remaining returnable" baseline independently for each line, letting their combined
      // quantity exceed what's actually returnable — reject outright, same rule invoices/purchase
      // bills already enforce at create time.
      const seenProductIds = new Set<string>();
      const seenCustomNames = new Set<string>();
      for (const item of items) {
        if (item.productId) {
          if (seenProductIds.has(item.productId)) {
            return NextResponse.json({ error: "Each product can only appear once per credit note — combine duplicate lines into a single quantity instead." }, { status: 400 });
          }
          seenProductIds.add(item.productId);
        } else {
          // Same reasoning for a custom (unlinked) line, keyed by name — the only thing that ties it back to its invoice line.
          const key = customLineKey(String(item.name ?? ""));
          if (!key) {
            return NextResponse.json({ error: "Custom return items must have a name" }, { status: 400 });
          }
          if (seenCustomNames.has(key)) {
            return NextResponse.json({ error: `"${item.name}" appears more than once on this credit note — combine duplicate lines into a single quantity instead.` }, { status: 400 });
          }
          seenCustomNames.add(key);
        }
      }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before recording a return" }, { status: 400 });
    }
    // TS narrowing on `invoice`/`auth` doesn't carry into the nested attemptCreate function below, so bind locals up front.
    const inv = invoice;
    const userId = auth.session.user.id;

    if (invoice.paidAmount <= 0) {
      return NextResponse.json({ error: "No payment received yet. Record a payment before processing a return." }, { status: 400 });
    }

    let returnDate = new Date();
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid return date" }, { status: 400 });
      }
      if (date < toIstDateStr(invoice.date)) {
        return NextResponse.json({ error: "Return date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Return date cannot be in the future" }, { status: 400 });
      }
      // Always normalized to exact IST midnight, regardless of how much time-of-day precision the
      // client sent — a "newest first" list sorts by this field, and a stray full timestamp (e.g.
      // from a direct API call bypassing the date-only UI picker) would otherwise outrank a
      // same-day row created later in real time.
      returnDate = istDayStartUtc(toIstDateStr(parsedDate));
    }

    // Blended-rate fallback for the rare case a line's productId has no matching invoice line at
    // all (the quantity cap below will reject such a line anyway, since it has 0 invoiced qty) —
    // computed from the pre-transaction snapshot since it's never actually load-bearing.
    const effectiveRate = invoice.subtotal > 0 ? ((invoice.cgst + invoice.sgst + invoice.igst) / invoice.subtotal) * 100 : 0;

    // Credit note numbering follows the same configurable FY-based pattern as invoices/bills, generated in the same Serializable transaction with retry-on-conflict.
    const biz = await getBusinessSettings();
    const creditNotePrefix = biz.creditNoteNumberPrefix || "CN";
    const creditNoteYearLabel = formatFinancialYearLabel(getIndianFinancialYear(returnDate));
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        // Re-read the invoice's own paidAmount/items INSIDE this transaction rather than trusting
        // the `inv`/`invoice.items` snapshot captured before the transaction opened — Postgres
        // Serializable isolation only detects a conflict on rows this transaction actually reads,
        // so without this re-read a concurrent payment edit/delete (which reduces paidAmount) or an
        // invoice item edit (which changes invoiced quantity) that commits in the gap between the
        // outer fetch and this transaction would go completely undetected, letting a return be
        // validated against stale numbers — the exact class of bug the payment PUT/DELETE routes'
        // own `existingReturnTotal` re-check exists to prevent from the other direction.
        const currentInvoice = await tx.invoice.findUniqueOrThrow({
          where: { id },
          select: {
            paidAmount: true,
            deletedAt: true,
            items: { select: { productId: true, name: true, quantity: true, price: true, gstRate: true, discountPercent: true } },
          },
        });
        // Re-checked under the transaction too — the invoice could have been binned after the outer check.
        if (currentInvoice.deletedAt) {
          throw new ReturnValidationError("This invoice is in the bin — restore it before recording a return");
        }

        // Custom (unlinked) invoice lines, keyed by trimmed lowercase name — the only link a custom
        // return line has back to what was actually invoiced. Rates come from the first matching
        // line; quantity is summed in case a legacy invoice predates the unique-custom-name rule.
        const customLines = new Map<string, { price: number; gstRate: number; discountPercent: number; quantity: number }>();
        for (const it of currentInvoice.items) {
          if (it.productId) continue;
          const key = customLineKey(it.name);
          const prev = customLines.get(key);
          if (prev) prev.quantity += it.quantity;
          else customLines.set(key, { price: it.price, gstRate: it.gstRate, discountPercent: it.discountPercent, quantity: it.quantity });
        }
        for (const item of items) {
          if (item.productId) continue;
          const line = customLines.get(customLineKey(item.name));
          if (!line) {
            throw new ReturnValidationError(`"${item.name}" doesn't match any custom item on this invoice.`);
          }
          if (Math.abs(line.price - item.price) > 0.005) {
            throw new ReturnValidationError(`Price for "${item.name}" must match the invoiced price (₹${line.price.toFixed(2)}).`);
          }
        }

        // Price, GST rate, and discount % are all inherited from the matching invoice line — a
        // credit note can't invent its own values for any of the three, or it could refund more
        // (or less) than what was actually charged for the returned goods. Rebuilt from this same
        // in-transaction re-read (not the pre-transaction `invoice.items` snapshot) so a concurrent
        // invoice-item edit landing in the gap can't leave a return computed from stale numbers.
        // A custom (non-catalog) item has no productId, so it inherits the same three values from
        // its name-matched unlinked invoice line (validated above) instead.
        const rateByProduct = new Map(currentInvoice.items.map((it) => [it.productId, it.gstRate]));
        const discountByProduct = new Map(currentInvoice.items.map((it) => [it.productId, it.discountPercent]));
        const priceByProduct = new Map(currentInvoice.items.map((it) => [it.productId, it.price]));

        const computedItems = items.map((item) => {
          if (!item.productId) {
            const line = customLines.get(customLineKey(item.name))!;
            const { discountAmount, taxable, gstAmt, total } = lineBreakdown({ qty: item.quantity, price: line.price, gstRate: line.gstRate, discountPercent: line.discountPercent });
            return { ...item, price: line.price, gstRate: line.gstRate, discountPercent: line.discountPercent, discountAmount, taxable, gstAmt, total };
          }
          const gstRate = (item.productId ? rateByProduct.get(item.productId) : undefined) ?? effectiveRate;
          const discountPercent = item.productId && discountByProduct.has(item.productId)
            ? discountByProduct.get(item.productId)!
            : Math.min(100, Math.max(0, item.discountPercent ?? 0));
          const price = item.productId && priceByProduct.has(item.productId)
            ? priceByProduct.get(item.productId)!
            : item.price;
          const { discountAmount, taxable, gstAmt, total } = lineBreakdown({ qty: item.quantity, price, gstRate, discountPercent });
          return { ...item, price, gstRate, discountPercent, discountAmount, taxable, gstAmt, total };
        });

        const subtotal = computedItems.reduce((s, i) => s + i.taxable, 0);
        const totalGst = computedItems.reduce((s, i) => s + i.gstAmt, 0);
        const cgst = inv.isInterState ? 0 : totalGst / 2;
        const sgst = inv.isInterState ? 0 : totalGst / 2;
        const igst = inv.isInterState ? totalGst : 0;
        const { roundOff, roundedTotal: creditNoteTotal } = computeRoundOff(subtotal + totalGst);

        const existingReturns = await tx.return.findMany({
          where: { invoiceId: id, deletedAt: null },
          include: { items: true },
        });
        // GST-inclusive value — capping against paidAmount on the ex-GST value alone would let more be refunded than the customer ever paid.
        const existingReturnTotal = existingReturns.reduce((s, r) => s + r.total, 0);
        const newReturnTotal = creditNoteTotal;
        const availableForReturn = currentInvoice.paidAmount - existingReturnTotal;

        if (newReturnTotal > availableForReturn + 0.01) {
          throw new ReturnValidationError(
            `Return value (₹${newReturnTotal.toFixed(2)}) exceeds available paid amount (₹${availableForReturn.toFixed(2)} remaining after previous returns).`
          );
        }

        // Quantity must not exceed what was invoiced net of quantity already returned, or a return could fabricate stock that was never sold.
        const invoicedQtyByProduct = new Map<string, number>();
        for (const it of currentInvoice.items) {
          if (!it.productId) continue;
          invoicedQtyByProduct.set(it.productId, (invoicedQtyByProduct.get(it.productId) ?? 0) + it.quantity);
        }
        const returnedQtyByProduct = new Map<string, number>();
        const returnedQtyByCustomName = new Map<string, number>();
        for (const r of existingReturns) {
          for (const ri of r.items) {
            if (!ri.productId) {
              const key = customLineKey(ri.name);
              returnedQtyByCustomName.set(key, (returnedQtyByCustomName.get(key) ?? 0) + ri.quantity);
              continue;
            }
            returnedQtyByProduct.set(ri.productId, (returnedQtyByProduct.get(ri.productId) ?? 0) + ri.quantity);
          }
        }
        for (const item of items) {
          if (!item.productId) {
            const key = customLineKey(item.name);
            const remaining = (customLines.get(key)?.quantity ?? 0) - (returnedQtyByCustomName.get(key) ?? 0);
            if (item.quantity > remaining) {
              throw new ReturnValidationError(
                `Cannot return ${item.quantity} of "${item.name}" — only ${remaining} unit(s) remain returnable on this invoice.`
              );
            }
            continue;
          }
          const invoicedQty = invoicedQtyByProduct.get(item.productId) ?? 0;
          const alreadyReturned = returnedQtyByProduct.get(item.productId) ?? 0;
          const remaining = invoicedQty - alreadyReturned;
          if (item.quantity > remaining) {
            throw new ReturnValidationError(
              `Cannot return ${item.quantity} of "${item.name}" — only ${remaining} unit(s) remain returnable on this invoice.`
            );
          }
        }

        const candidatesThisYear = await tx.return.findMany({
          where: { creditNoteNumber: numberFormatDbFilter(biz.creditNoteNumberFormat, creditNotePrefix, creditNoteYearLabel) },
          select: { creditNoteNumber: true },
        });
        const { documentNumber: creditNoteNumber, overrideUsed } = computeNextNumber(
          candidatesThisYear.map((c) => c.creditNoteNumber).filter((n): n is string => n !== null),
          biz.creditNoteNumberFormat,
          creditNotePrefix,
          creditNoteYearLabel,
          biz.nextCreditNoteNumberOverride
        );
        if (overrideUsed) {
          await tx.businessSettings.update({ where: { id: "singleton" }, data: { nextCreditNoteNumberOverride: null } });
        }

        const created = await tx.return.create({
          data: {
            invoiceId: id,
            creditNoteNumber,
            date: returnDate,
            notes: notes || null,
            subtotal, cgst, sgst, igst, roundOff, total: creditNoteTotal,
            idempotencyKey: idempotencyKey || null,
            createdByUserId: userId,
            items: {
              create: computedItems.map((item) => ({
                productId: item.productId || null,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                discountPercent: item.discountPercent,
                discountAmount: item.discountAmount,
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
        // Two near-simultaneous requests carrying the same idempotency key can both pass the
        // pre-check above and race to insert — the loser hits the unique constraint here.
        const isDuplicateKey = idempotencyKey
          && error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
          && Array.isArray((error.meta as { target?: unknown })?.target)
          && (error.meta as { target: string[] }).target.includes("idempotencyKey");
        if (isDuplicateKey) {
          const racing = await prisma.return.findUnique({ where: { idempotencyKey }, include: { items: true } });
          if (racing && racing.invoiceId === id) {
            return NextResponse.json(racing, { status: 200 });
          }
          return NextResponse.json({ error: "This idempotency key was already used for a different credit note." }, { status: 409 });
        }
        throw error;
      }
    }

    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const itemSummary = items.map(i => `${i.name} ×${i.quantity}`).join(", ");
    await logActivity(
      auth.session.user.id,
      "create_return",
      `Credit note ${ret!.creditNoteNumber} recorded for invoice ${invoice.invoiceNumber} (${invoice.customer.name}) — ${itemSummary} | Total: ₹${ret!.total.toFixed(2)}`,
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

// Same key the invoice create/edit routes use to keep custom item names unique per invoice.
function customLineKey(name: string): string {
  return name.trim().toLowerCase();
}
