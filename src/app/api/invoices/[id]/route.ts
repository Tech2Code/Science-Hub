import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInvoice, getBusinessSettings } from "@/lib/db";
import { deriveIsInterState } from "@/lib/gstLocation";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { assertInvoiceQuantitiesNotBelowReturned, InvoiceQuantityValidationError } from "@/lib/invoiceReturns";

class InvoiceConflictError extends Error {}
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { computeRoundOff } from "@/lib/roundOff";
import { lineBreakdown } from "@/lib/invoiceCalc";

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
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { items, notes, dueDate, isInterState: clientIsInterState, placeOfSupply, reverseCharge, status, expectedUpdatedAt } = body;

    const existingBase = await prisma.invoice.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true } });
    if (!existingBase) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (existingBase.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before editing" }, { status: 400 });
    }
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existingBase.updatedAt.getTime()) {
      return NextResponse.json({ error: "This invoice was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

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

    if (!placeOfSupply || !String(placeOfSupply).trim()) {
      return NextResponse.json({ error: "Place of supply is required" }, { status: 400 });
    }

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { paidAmount: true, status: true, invoiceNumber: true, date: true },
    });
    if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (existing.status === "paid") {
      return NextResponse.json({ error: "A fully paid invoice cannot be edited" }, { status: 400 });
    }

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const invoiceDate = new Date(existing.date); invoiceDate.setHours(0, 0, 0, 0);
      if (parsedDueDate < invoiceDate) {
        return NextResponse.json({ error: "Due date cannot be before the invoice date" }, { status: 400 });
      }
    }

    for (const item of items as { qty?: number; quantity?: number; price: number; gstRate?: number; discountPercent?: number }[]) {
      const quantity = parseFloat(String(item.qty ?? item.quantity ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? 0));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      if (!(quantity > 0)) {
        return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
      }
      if (!(price >= 0)) {
        return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
      }
      if (!(gstRate >= 0)) {
        return NextResponse.json({ error: "Item GST rate cannot be negative" }, { status: 400 });
      }
      if (!(discountPercent >= 0 && discountPercent <= 100)) {
        return NextResponse.json({ error: "Item discount must be between 0 and 100%" }, { status: 400 });
      }
    }
    {
      const seenProductIds = new Set<string>();
      for (const item of items as { productId: string }[]) {
        if (seenProductIds.has(item.productId)) {
          return NextResponse.json({ error: "Each product can only appear once per invoice — combine duplicate lines into a single quantity instead." }, { status: 400 });
        }
        seenProductIds.add(item.productId);
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
      price: number; gstRate: number; unit?: string; hsn?: string; discountPercent?: number;
    }) => {
      const product = productMap.get(item.productId);
      const quantity = parseFloat(String(item.qty ?? item.quantity ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? product?.gstRate ?? 18));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      const { discountAmount, gstAmt: gstAmount, total: itemTotal, taxable: itemSubtotal } =
        lineBreakdown({ qty: quantity, price, gstRate, discountPercent });
      subtotal += itemSubtotal;
      totalGst += gstAmount;
      return {
        productId: item.productId,
        name: product?.name ?? "Unknown Product",
        hsn: (item.hsn ?? product?.hsn ?? "").trim(),
        quantity,
        unit: item.unit ?? product?.unit ?? "Nos",
        price,
        discountPercent,
        discountAmount,
        gstRate,
        gstAmount,
        total: itemTotal,
      };
    });

    // Independently verify inter-state vs. intra-state from the business's
    // own configured state rather than trusting the client-supplied flag —
    // mirrors the same check in POST /api/invoices. Falls back to the
    // client's value only if the business state isn't configured yet.
    const biz = await getBusinessSettings();
    const derivedIsInterState = deriveIsInterState(String(placeOfSupply), biz.state);
    const inter = derivedIsInterState !== null ? derivedIsInterState : Boolean(clientIsInterState);
    const cgst = inter ? 0 : totalGst / 2;
    const sgst = inter ? 0 : totalGst / 2;
    const igst = inter ? totalGst : 0;
    const { roundOff, roundedTotal: total } = computeRoundOff(subtotal + totalGst);

    // Recalculate status based on paidAmount
    const paidAmount = existing.paidAmount;
    let newStatus = "unpaid";
    if (paidAmount >= total) newStatus = "paid";
    else if (paidAmount > 0) newStatus = "partial";

    const { invoice, stockWarnings } = await prisma.$transaction(async (tx) => {
      // Re-check the optimistic-lock condition atomically against the row,
      // inside the transaction — the earlier check above ran as a separate
      // query, leaving a race window where two concurrent edits could both
      // pass it and the second would silently overwrite the first. This
      // updateMany's WHERE re-evaluates under the row lock it takes, so a
      // conflicting concurrent write is caught even without Serializable
      // isolation.
      if (expectedUpdatedAt) {
        const guard = await tx.invoice.updateMany({
          where: { id, updatedAt: existingBase.updatedAt },
          data: { updatedAt: new Date() },
        });
        if (guard.count === 0) throw new InvoiceConflictError();
      }

      // Must run before any mutation: an edited quantity can never drop
      // below what's already been returned against that product, otherwise
      // stock/ledger/accounting would be reconciled against units that no
      // longer exist on the invoice. Throwing here aborts the transaction
      // untouched — nothing has been written yet.
      await assertInvoiceQuantitiesNotBelowReturned(tx, id, invoiceItems);

      // Restore stock for old items before replacing them — one batched
      // UPDATE for every line item instead of one round trip each, so large
      // invoices don't blow past the transaction timeout.
      const oldItems = await tx.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { productId: true, quantity: true },
      });
      await batchAdjustStock(
        tx,
        oldItems.map((old) => ({ productId: old.productId, quantity: old.quantity })),
        {
          type: "sale_edit_reverse",
          reference: existing.invoiceNumber,
          notes: "Invoice edited — old items reversed",
          createdByUserId: auth.session.user.id,
        }
      );

      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      const inv = await tx.invoice.update({
        where: { id },
        data: {
          isInterState: inter,
          placeOfSupply: String(placeOfSupply).trim(),
          reverseCharge: Boolean(reverseCharge),
          dueDate: dueDate ? new Date(dueDate) : null,
          notes: notes ?? null,
          subtotal,
          cgst,
          sgst,
          igst,
          total,
          roundOff,
          status: newStatus,
          items: { create: invoiceItems },
        },
        include: { items: true, customer: true },
      });

      // Deduct stock for new items — one batched UPDATE ... RETURNING gives
      // back every product's post-update stock in a single round trip, which
      // is also how we detect negative stock without a second query per item.
      const updatedProducts = await batchAdjustStock(
        tx,
        (invoiceItems as { productId: string; quantity: number }[]).map((item) => ({
          productId: item.productId,
          quantity: -item.quantity,
        })),
        {
          type: "sale_edit_apply",
          reference: existing.invoiceNumber,
          notes: "Invoice edited — new items applied",
          createdByUserId: auth.session.user.id,
        }
      );
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
    if (error instanceof InvoiceQuantityValidationError) {
      return NextResponse.json({ error: error.message, errors: error.errors }, { status: 400 });
    }
    if (error instanceof InvoiceConflictError) {
      return NextResponse.json({ error: "This invoice was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }
    console.error(error);
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "One of the products on this invoice no longer exists — remove it and re-add it from the current product list." }, { status: 400 });
      }
      if (error.code === "P2028") {
        return NextResponse.json({ error: "The update took too long and timed out — please try again." }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriteAccess();
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
      await batchAdjustStock(
        tx,
        items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        {
          type: "sale_delete_restore",
          reference: inv.invoiceNumber,
          notes: "Invoice deleted",
          createdByUserId: auth.session.user.id,
        }
      );
      return { found: true, alreadyDeleted: false, inv };
    }, { timeout: 20000, maxWait: 10000 });

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
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
