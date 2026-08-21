import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { isFutureIstDate, toIstDateStr } from "@/lib/validation";
import { requireWriteAccess } from "@/lib/apiAuth";

class PaymentExceedsBalanceError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const { amount, method, reference, date, notes } = body;

    if (!amount || amount <= 0) return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
    if (typeof reference === "string" && reference.length > 500) {
      return NextResponse.json({ error: "Reference is too long (max 500 characters)." }, { status: 400 });
    }
    if (typeof notes === "string" && notes.length > 2000) {
      return NextResponse.json({ error: "Notes is too long (max 2000 characters)." }, { status: 400 });
    }

    const billCheck = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!billCheck) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (billCheck.status === "cancelled") {
      return NextResponse.json({ error: "Cannot record a payment against a cancelled bill." }, { status: 400 });
    }

    let paymentDate = new Date();
    if (date) {
      paymentDate = new Date(date);
      if (isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (date < toIstDateStr(billCheck.billDate)) {
        return NextResponse.json({ error: "Payment date cannot be before the bill date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
    }

    // Re-read and re-validate balance inside a Serializable transaction so concurrent/duplicate submissions can't overpay; retry on conflict (P2034).
    async function attemptPayment() {
      return prisma.$transaction(async (tx) => {
        const bill = await tx.purchaseBill.findUniqueOrThrow({ where: { id } });
        if (bill.status === "cancelled") {
          throw new PaymentExceedsBalanceError("Cannot record a payment against a cancelled bill.");
        }
        const balance = bill.total - bill.paidAmount;
        if (amount > balance + 0.01) {
          throw new PaymentExceedsBalanceError(`Amount exceeds balance due (₹${balance.toFixed(2)}).`);
        }

        const created = await tx.purchasePayment.create({
          data: {
            purchaseBillId: id,
            amount,
            method: method ?? "cash",
            reference: reference || null,
            date: paymentDate,
            notes: notes || null,
          },
        });

        // Recompute paidAmount from the actual sum of payment rows (not an increment) so it can't drift if a payment is edited/deleted elsewhere.
        const agg = await tx.purchasePayment.aggregate({
          where: { purchaseBillId: id },
          _sum: { amount: true },
        });
        const newPaid = agg._sum.amount ?? 0;
        const newStatus = newPaid >= bill.total - 0.01 ? "paid" : newPaid > 0 ? "partial" : "unpaid";

        await tx.purchaseBill.update({
          where: { id },
          data: { paidAmount: newPaid, status: newStatus },
        });
        return created;
      }, { isolationLevel: "Serializable" });
    }

    const maxAttempts = 5;
    let payment: Awaited<ReturnType<typeof attemptPayment>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        payment = await attemptPayment();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }

    await logActivity(auth.session.user.id, "record_purchase_payment", `Recorded ₹${amount} payment for bill ${billCheck.billNumber}`, id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
