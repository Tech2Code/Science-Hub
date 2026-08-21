import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireWriteAccess } from "@/lib/apiAuth";
import { isFutureIstDate, toIstDateStr } from "@/lib/validation";

class PaymentExceedsBalanceError extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { amount, method, reference, notes, date } = body;

    const amountStr = (typeof amount === "string" || typeof amount === "number") ? String(amount).trim() : "";
    if (!/^\d+(\.\d+)?$/.test(amountStr) || parseFloat(amountStr) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    if (typeof reference === "string" && reference.length > 500) {
      return NextResponse.json({ error: "Reference is too long (max 500 characters)." }, { status: 400 });
    }
    if (typeof notes === "string" && notes.length > 2000) {
      return NextResponse.json({ error: "Notes is too long (max 2000 characters)." }, { status: 400 });
    }

    const invoiceCheck = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, deletedAt: true, date: true, customer: { select: { name: true } } },
    });
    if (!invoiceCheck) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoiceCheck.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before recording a payment" }, { status: 400 });
    }

    let paymentDate: Date | undefined;
    if (date) {
      paymentDate = new Date(date);
      if (isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (date < toIstDateStr(invoiceCheck.date)) {
        return NextResponse.json({ error: "Payment date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
    }

    // Re-read and re-validate balance inside a Serializable transaction so concurrent/duplicate submissions can't both overpay the invoice; retry on conflict (P2034).
    async function attemptPayment() {
      return prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
        const remaining = invoice.total - invoice.paidAmount;
        if (parseFloat(amount) > remaining + 0.01) {
          throw new PaymentExceedsBalanceError(
            `Payment (₹${parseFloat(amount).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})`
          );
        }

        await tx.payment.create({
          data: {
            invoiceId: id,
            amount: parseFloat(amount),
            method: method || "cash",
            reference: reference || null,
            notes: notes || null,
            ...(paymentDate ? { date: paymentDate } : {}),
          },
        });

        const agg = await tx.payment.aggregate({
          where: { invoiceId: id },
          _sum: { amount: true },
        });

        const paidAmount = agg._sum.amount ?? 0;
        const status = paidAmount + 0.01 >= invoice.total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

        return tx.invoice.update({
          where: { id },
          data: { paidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable" });
    }

    const maxAttempts = 5;
    let updated: Awaited<ReturnType<typeof attemptPayment>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        updated = await attemptPayment();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "record_payment",
      `Recorded payment ₹${fmt(parseFloat(amount))} via ${method || "Cash"} for invoice ${invoiceCheck.invoiceNumber} (${invoiceCheck.customer.name})`,
      id,
      "invoice"
    );

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to add payment" }, { status: 500 });
  }
}
