import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { amount, method, reference, date, notes } = body;

    if (!amount || amount <= 0) return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });

    const bill = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    const balance = bill.total - bill.paidAmount;
    if (amount > balance + 0.01) return NextResponse.json({ error: `Amount exceeds balance due (₹${balance.toFixed(2)}).` }, { status: 400 });

    const newPaid = bill.paidAmount + amount;
    const newStatus = newPaid >= bill.total - 0.01 ? "paid" : "partial";

    const [payment] = await prisma.$transaction([
      prisma.purchasePayment.create({
        data: {
          purchaseBillId: id,
          amount,
          method: method ?? "cash",
          reference: reference || null,
          date: date ? new Date(date) : new Date(),
          notes: notes || null,
        },
      }),
      prisma.purchaseBill.update({
        where: { id },
        data: { paidAmount: newPaid, status: newStatus },
      }),
    ]);

    await logActivity(session.user.id, "record_purchase_payment", `Recorded ₹${amount} payment for bill ${bill.billNumber}`, id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    return NextResponse.json(payment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
