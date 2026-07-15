import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

class PaymentExceedsBalanceError extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { amount, method, reference, notes } = body;

    const amountStr = (typeof amount === "string" || typeof amount === "number") ? String(amount).trim() : "";
    if (!/^\d+(\.\d+)?$/.test(amountStr) || parseFloat(amountStr) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const invoiceCheck = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, deletedAt: true, customer: { select: { name: true } } },
    });
    if (!invoiceCheck) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoiceCheck.deletedAt) {
      return NextResponse.json({ error: "This invoice is in the bin — restore it before recording a payment" }, { status: 400 });
    }

    // Re-read the invoice and re-validate the remaining balance inside a
    // Serializable transaction so two concurrent/duplicate submissions can't
    // both pass the balance check against the same stale paidAmount and
    // overpay the invoice. Postgres aborts the losing side of a genuine
    // conflict with a serialization failure (Prisma P2034) rather than
    // silently letting it commit — retry a few times so a same-time
    // double-click just costs the user a brief delay instead of a raw 500.
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
