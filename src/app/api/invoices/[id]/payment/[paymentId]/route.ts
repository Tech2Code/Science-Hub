import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { revalidateTag } from "next/cache";
import { requireWriteAccess } from "@/lib/apiAuth";
import { isFutureIstDate } from "@/lib/validation";

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

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.invoiceId !== id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const otherPayments = await prisma.payment.aggregate({
      where: { invoiceId: id, id: { not: paymentId } },
      _sum: { amount: true },
    });
    const remaining = invoice.total - (otherPayments._sum.amount ?? 0);
    if (parseFloat(amount) > remaining + 0.01) {
      return NextResponse.json(
        { error: `Payment (₹${parseFloat(amount).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})` },
        { status: 400 }
      );
    }

    let paymentDate: Date | undefined;
    if (date) {
      paymentDate = new Date(date);
      if (isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (paymentDate < invoice.date) {
        return NextResponse.json({ error: "Payment date cannot be before the invoice date" }, { status: 400 });
      }
      if (isFutureIstDate(date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
    }

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount: parseFloat(amount),
        method: method || payment.method,
        reference: reference || null,
        ...(paymentDate ? { date: paymentDate } : {}),
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

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "update_payment",
      `Updated payment to ₹${fmt(parseFloat(amount))} via ${method} for invoice ${invoice.invoiceNumber} (${invoice.customer.name})`,
      id,
      "invoice"
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
