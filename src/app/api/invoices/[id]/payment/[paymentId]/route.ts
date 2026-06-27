import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { amount, method, reference, date } = body;

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount: parseFloat(amount),
        method: method || payment.method,
        reference: reference || null,
        ...(date ? { date: new Date(date) } : {}),
      },
    });

    // Recalculate invoice paid amount and status
    const agg = await prisma.payment.aggregate({
      where: { invoiceId: id },
      _sum: { amount: true },
    });
    const paidAmount = agg._sum.amount ?? 0;
    const status = paidAmount >= invoice.total ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

    const updated = await prisma.invoice.update({
      where: { id },
      data: { paidAmount, status },
      include: { payments: { orderBy: { date: "desc" } } },
    });

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    if (session?.user?.id) {
      const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
      await logActivity(
        session.user.id,
        "update_payment",
        `Updated payment to ₹${fmt(parseFloat(amount))} via ${method} for invoice ${invoice.invoiceNumber} (${invoice.customer.name})`,
        id,
        "invoice"
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
