import { NextRequest, NextResponse } from "next/server";
import { round2 } from "@/lib/roundOff";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireWriteAccess } from "@/lib/apiAuth";
import { retryOnWriteConflict } from "@/lib/retryOnWriteConflict";
import { isFutureIstDate, toIstDateStr, istDayStartUtc } from "@/lib/validation";

class PaymentExceedsBalanceError extends Error {}
class PaymentConflictError extends Error {}
class PaymentBelowReturnedError extends Error {}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id, paymentId } = await params;
    const body = await request.json();
    const { amount, method, reference, date } = body;

    const amountStr = (typeof amount === "string" || typeof amount === "number") ? String(amount).trim() : "";
    if (!/^\d+(\.\d+)?$/.test(amountStr) || round2(parseFloat(amountStr)) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    if (typeof reference === "string" && reference.length > 500) {
      return NextResponse.json({ error: "Reference is too long (max 500 characters)." }, { status: 400 });
    }

    // Pre-checks outside the transaction — cheap, and let us return a clean
    // 404 before paying the cost of a Serializable transaction attempt.
    const paymentCheck = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!paymentCheck || paymentCheck.invoiceId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const invoiceCheck = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoiceCheck) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoiceCheck.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before editing a payment" }, { status: 400 });
    }

    let paymentDate: Date | undefined;
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (date < toIstDateStr(invoiceCheck.date)) {
        return NextResponse.json({ error: "Payment date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
      // Normalized to exact IST midnight — see the same note in returns/route.ts.
      paymentDate = istDayStartUtc(toIstDateStr(parsedDate));
    }

    // Re-validate balance inside a Serializable transaction (mirrors the create-payment route) so concurrent edits can't together overpay the invoice.
    async function attemptUpdate() {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.invoiceId !== id) {
          throw new PaymentConflictError("Payment not found");
        }
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
        if (invoice.deletedAt) {
          throw new PaymentExceedsBalanceError("This invoice is in the bin — restore it before editing a payment");
        }
        if (date && date < toIstDateStr(invoice.date)) {
          throw new PaymentExceedsBalanceError("Payment date cannot be before the invoice date");
        }

        const otherPayments = await tx.payment.aggregate({
          where: { invoiceId: id, id: { not: paymentId } },
          _sum: { amount: true },
        });
        const otherPaymentsTotal = otherPayments._sum.amount ?? 0;
        const remaining = invoice.total - otherPaymentsTotal;
        if (round2(parseFloat(amountStr)) > round2(remaining)) {
          throw new PaymentExceedsBalanceError(
            `Payment (₹${round2(parseFloat(amountStr)).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})`
          );
        }

        // A credit note is capped at creation time against the invoice's paidAmount as it stood
        // then (see returns/route.ts) — that check isn't a standing DB constraint, so reducing a
        // payment afterward could otherwise leave the invoice claiming less cash received than it
        // has already refunded via credit notes. Re-verify against the new paidAmount here.
        const existingReturns = await tx.return.aggregate({
          where: { invoiceId: id, deletedAt: null },
          _sum: { total: true },
        });
        const existingReturnTotal = existingReturns._sum.total ?? 0;
        const newPaidAmount = otherPaymentsTotal + round2(parseFloat(amountStr));
        if (round2(newPaidAmount) < round2(existingReturnTotal)) {
          throw new PaymentBelowReturnedError(
            `Cannot reduce this payment — ₹${existingReturnTotal.toFixed(2)} has already been refunded via credit note(s) against the paid amount.`
          );
        }

        await tx.payment.update({
          where: { id: paymentId },
          data: {
            amount: round2(parseFloat(amountStr)),
            method: method || payment.method,
            reference: reference || null,
            ...(paymentDate ? { date: paymentDate } : {}),
          },
        });

        const agg = await tx.payment.aggregate({
          where: { invoiceId: id },
          _sum: { amount: true },
        });
        const paidAmount = agg._sum.amount ?? 0;
        const status = paidAmount > 0 && round2(invoice.total - paidAmount) <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

        return tx.invoice.update({
          where: { id },
          data: { paidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 });
    }

    const updated = await retryOnWriteConflict(attemptUpdate);

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "update_payment",
      `Updated payment to ₹${fmt(round2(parseFloat(amountStr)))} via ${method} for invoice ${invoiceCheck.invoiceNumber} (${invoiceCheck.customer.name})`,
      id,
      "invoice"
    );

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PaymentExceedsBalanceError || error instanceof PaymentBelowReturnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentConflictError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id, paymentId } = await params;

    const paymentCheck = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!paymentCheck || paymentCheck.invoiceId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const invoiceCheck = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoiceCheck) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoiceCheck.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before deleting a payment" }, { status: 400 });
    }

    async function attemptDelete() {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.invoiceId !== id) {
          throw new PaymentConflictError("Payment not found");
        }
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
        if (invoice.deletedAt) {
          throw new PaymentExceedsBalanceError("This invoice is in the bin — restore it before deleting a payment");
        }

        const otherPayments = await tx.payment.aggregate({
          where: { invoiceId: id, id: { not: paymentId } },
          _sum: { amount: true },
        });
        const newPaidAmount = otherPayments._sum.amount ?? 0;

        // Same guard as the PUT above — deleting the payment can't drop paidAmount below what's
        // already been refunded via credit note(s) against it.
        const existingReturns = await tx.return.aggregate({
          where: { invoiceId: id, deletedAt: null },
          _sum: { total: true },
        });
        const existingReturnTotal = existingReturns._sum.total ?? 0;
        if (round2(newPaidAmount) < round2(existingReturnTotal)) {
          throw new PaymentBelowReturnedError(
            `Cannot delete this payment — ₹${existingReturnTotal.toFixed(2)} has already been refunded via credit note(s) against the paid amount.`
          );
        }

        await tx.payment.delete({ where: { id: paymentId } });

        const status = newPaidAmount > 0 && round2(invoice.total - newPaidAmount) <= 0 ? "paid" : newPaidAmount > 0 ? "partial" : "unpaid";

        return tx.invoice.update({
          where: { id },
          data: { paidAmount: newPaidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 });
    }

    const updated = await retryOnWriteConflict(attemptDelete);

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "delete_payment",
      `Deleted payment of ₹${fmt(paymentCheck.amount)} via ${paymentCheck.method} for invoice ${invoiceCheck.invoiceNumber} (${invoiceCheck.customer.name})`,
      id,
      "invoice"
    );

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PaymentBelowReturnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentConflictError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to delete payment" }, { status: 500 });
  }
}
