import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireWriteAccess } from "@/lib/apiAuth";
import { isFutureIstDate } from "@/lib/validation";

class PaymentExceedsBalanceError extends Error {}
class PaymentConflictError extends Error {}

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

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
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

    let paymentDate: Date | undefined;
    if (date) {
      paymentDate = new Date(date);
      if (isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (paymentDate < invoiceCheck.date) {
        return NextResponse.json({ error: "Payment date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
    }

    // Re-read the payment/invoice and re-validate the remaining balance
    // inside a Serializable transaction, mirroring the create-payment route.
    // Without this, two concurrent edits (or an edit racing a new payment)
    // could each pass the balance check against the same stale paidAmount
    // and together push the invoice over its total.
    async function attemptUpdate() {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.invoiceId !== id) {
          throw new PaymentConflictError("Payment not found");
        }
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });

        const otherPayments = await tx.payment.aggregate({
          where: { invoiceId: id, id: { not: paymentId } },
          _sum: { amount: true },
        });
        const remaining = invoice.total - (otherPayments._sum.amount ?? 0);
        if (parseFloat(amount) > remaining + 0.01) {
          throw new PaymentExceedsBalanceError(
            `Payment (₹${parseFloat(amount).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})`
          );
        }

        await tx.payment.update({
          where: { id: paymentId },
          data: {
            amount: parseFloat(amount),
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
        const status = paidAmount >= invoice.total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

        return tx.invoice.update({
          where: { id },
          data: { paidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable" });
    }

    const maxAttempts = 5;
    let updated: Awaited<ReturnType<typeof attemptUpdate>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        updated = await attemptUpdate();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "update_payment",
      `Updated payment to ₹${fmt(parseFloat(amount))} via ${method} for invoice ${invoiceCheck.invoiceNumber} (${invoiceCheck.customer.name})`,
      id,
      "invoice"
    );

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PaymentConflictError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
