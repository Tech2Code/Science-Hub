import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

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

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const remaining = invoice.total - invoice.paidAmount;
    if (parseFloat(amount) > remaining + 0.01) {
      return NextResponse.json({
        error: `Payment (₹${parseFloat(amount).toFixed(2)}) exceeds the remaining balance (₹${remaining.toFixed(2)})`,
      }, { status: 400 });
    }

    await prisma.payment.create({
      data: {
        invoiceId: id,
        amount: parseFloat(amount),
        method: method || "cash",
        reference: reference || null,
        notes: notes || null,
      },
    });

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

    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await logActivity(
      auth.session.user.id,
      "record_payment",
      `Recorded payment ₹${fmt(parseFloat(amount))} via ${method || "Cash"} for invoice ${invoice.invoiceNumber} (${invoice.customer.name})`,
      id,
      "invoice"
    );

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to add payment" }, { status: 500 });
  }
}
