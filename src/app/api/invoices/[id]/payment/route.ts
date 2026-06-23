import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { amount, method, reference, notes } = body;

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

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

    revalidateTag(`invoice-${id}`, { expire: 0 });
    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    if (session?.user?.id) {
      const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
      await logActivity(
        session.user.id,
        "record_payment",
        `Recorded payment ₹${fmt(parseFloat(amount))} via ${method || "Cash"} for invoice ${invoice.invoiceNumber} (${invoice.customer.name})`,
        id,
        "invoice"
      );
    }

    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to add payment" }, { status: 500 });
  }
}
