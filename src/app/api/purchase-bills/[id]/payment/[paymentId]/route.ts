import { NextRequest, NextResponse } from "next/server";
import { round2 } from "@/lib/roundOff";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { isFutureIstDate, toIstDateStr, istDayStartUtc } from "@/lib/validation";
import { requireWriteAccess } from "@/lib/apiAuth";
import { retryOnWriteConflict } from "@/lib/retryOnWriteConflict";

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

    const amountStr = (typeof amount === "string" || typeof amount === "number") ? String(amount).trim() : "";
    if (!/^\d+(\.\d+)?$/.test(amountStr) || round2(parseFloat(amountStr)) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    if (method !== undefined && method !== null && (typeof method !== "string" || method.length > 100)) {
      return NextResponse.json({ error: "Payment method is too long (max 100 characters)." }, { status: 400 });
    }
    if (typeof reference === "string" && reference.length > 500) {
      return NextResponse.json({ error: "Reference is too long (max 500 characters)." }, { status: 400 });
    }

    const paymentCheck = await prisma.purchasePayment.findUnique({ where: { id: paymentId } });
    if (!paymentCheck || paymentCheck.purchaseBillId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const billCheck = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!billCheck) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (billCheck.status === "cancelled") {
      return NextResponse.json({ error: "Cannot edit a payment on a cancelled bill." }, { status: 400 });
    }

    let paymentDate: Date | undefined;
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (date < toIstDateStr(billCheck.billDate)) {
        return NextResponse.json({ error: "Payment date cannot be before the bill date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
      paymentDate = istDayStartUtc(toIstDateStr(parsedDate));
    }

    // Re-validate balance inside a Serializable transaction (mirrors the create-payment route) so concurrent edits can't together overpay the bill.
    async function attemptUpdate() {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.purchasePayment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.purchaseBillId !== id) {
          throw new PaymentConflictError("Payment not found");
        }
        const bill = await tx.purchaseBill.findUniqueOrThrow({ where: { id } });
        if (bill.deletedAt) {
          throw new PaymentExceedsBalanceError("This purchase bill is in the bin — restore it before editing a payment.");
        }
        if (bill.status === "cancelled") {
          throw new PaymentExceedsBalanceError("Cannot edit a payment on a cancelled bill.");
        }
        if (date && date < toIstDateStr(bill.billDate)) {
          throw new PaymentExceedsBalanceError("Payment date cannot be before the bill date");
        }

        const otherPayments = await tx.purchasePayment.aggregate({
          where: { purchaseBillId: id, id: { not: paymentId } },
          _sum: { amount: true },
        });
        const otherPaymentsTotal = otherPayments._sum.amount ?? 0;
        const remaining = bill.total - otherPaymentsTotal;
        if (round2(parseFloat(amountStr)) > round2(remaining)) {
          throw new PaymentExceedsBalanceError(
            `Payment (₹${round2(parseFloat(amountStr)).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})`
          );
        }

        await tx.purchasePayment.update({
          where: { id: paymentId },
          data: {
            amount: round2(parseFloat(amountStr)),
            method: method || payment.method,
            reference: reference || null,
            ...(paymentDate ? { date: paymentDate } : {}),
          },
        });

        const agg = await tx.purchasePayment.aggregate({
          where: { purchaseBillId: id },
          _sum: { amount: true },
        });
        const paidAmount = agg._sum.amount ?? 0;
        // A cancelled bill's status is a deliberate, directly-set value — never recompute it away
        // from "cancelled" just because a correction changed how much was paid against it.
        const status = bill.status === "cancelled"
          ? "cancelled"
          : paidAmount > 0 && round2(bill.total - paidAmount) <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

        return tx.purchaseBill.update({
          where: { id },
          data: { paidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 });
    }

    const updated = await retryOnWriteConflict(attemptUpdate);

    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "update_purchase_payment",
      `Updated payment to ₹${fmt(round2(parseFloat(amountStr)))} via ${method || paymentCheck.method} for bill ${billCheck.billNumber}`,
      id,
      "purchase_bill"
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id, paymentId } = await params;

    const paymentCheck = await prisma.purchasePayment.findUnique({ where: { id: paymentId } });
    if (!paymentCheck || paymentCheck.purchaseBillId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const billCheck = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!billCheck) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (billCheck.status === "cancelled") {
      return NextResponse.json({ error: "Cannot edit a payment on a cancelled bill." }, { status: 400 });
    }

    async function attemptDelete() {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.purchasePayment.findUnique({ where: { id: paymentId } });
        if (!payment || payment.purchaseBillId !== id) {
          throw new PaymentConflictError("Payment not found");
        }
        const bill = await tx.purchaseBill.findUniqueOrThrow({ where: { id } });
        if (bill.deletedAt) {
          throw new PaymentExceedsBalanceError("This purchase bill is in the bin — restore it before deleting a payment.");
        }
        if (bill.status === "cancelled") {
          throw new PaymentExceedsBalanceError("Cannot delete a payment on a cancelled bill.");
        }

        await tx.purchasePayment.delete({ where: { id: paymentId } });

        const agg = await tx.purchasePayment.aggregate({
          where: { purchaseBillId: id },
          _sum: { amount: true },
        });
        const paidAmount = agg._sum.amount ?? 0;
        const status = bill.status === "cancelled"
          ? "cancelled"
          : paidAmount > 0 && round2(bill.total - paidAmount) <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

        return tx.purchaseBill.update({
          where: { id },
          data: { paidAmount, status },
          include: { payments: { orderBy: { date: "desc" } } },
        });
      }, { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 });
    }

    const updated = await retryOnWriteConflict(attemptDelete);

    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "delete_purchase_payment",
      `Deleted payment of ₹${fmt(paymentCheck.amount)} via ${paymentCheck.method} for bill ${billCheck.billNumber}`,
      id,
      "purchase_bill"
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
    return NextResponse.json({ error: "Failed to delete payment" }, { status: 500 });
  }
}
