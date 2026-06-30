import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true } },
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  payments: { orderBy: { date: "desc" as const } },
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const vendorId = searchParams.get("vendorId");

    const bills = await prisma.purchaseBill.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(vendorId ? { vendorId } : {}),
      },
      include: BILL_INCLUDE,
      orderBy: { billDate: "desc" },
    });
    return NextResponse.json(bills);
  } catch {
    return NextResponse.json({ error: "Failed to fetch purchase bills" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { vendorId, billDate, dueDate, subtotal, taxAmount, discount, total, notes, category, items, payment } = body;

    if (!vendorId) return NextResponse.json({ error: "Vendor is required." }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "At least one item is required." }, { status: 400 });

    // Auto-generate bill number: PB-YYYY-0001
    const year = new Date(billDate ?? Date.now()).getFullYear();
    const prefix = `PB-${year}-`;
    const last = await prisma.purchaseBill.findFirst({
      where: { billNumber: { startsWith: prefix } },
      orderBy: { billNumber: "desc" },
    });
    const seq = last ? parseInt(last.billNumber.split("-")[2] ?? "0") + 1 : 1;
    const billNumber = `${prefix}${String(seq).padStart(4, "0")}`;

    const payAmt = payment?.amount ?? 0;
    const billTotal = total ?? 0;
    const paidAmount = Math.min(payAmt, billTotal);
    const status = paidAmount >= billTotal && billTotal > 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

    const bill = await prisma.purchaseBill.create({
      data: {
        billNumber,
        vendorId,
        billDate: billDate ? new Date(billDate) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        subtotal: subtotal ?? 0,
        taxAmount: taxAmount ?? 0,
        discount: discount ?? 0,
        total: billTotal,
        paidAmount,
        status,
        notes: notes || null,
        category: category || null,
        createdByUserId: session.user.id,
        items: {
          create: items.map((item: {
            productId?: string; name: string; quantity: number;
            unit?: string; purchasePrice: number; gstRate?: number; gstAmount?: number; total: number;
          }) => ({
            productId: item.productId || null,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit ?? "Nos",
            purchasePrice: item.purchasePrice,
            gstRate: item.gstRate ?? 0,
            gstAmount: item.gstAmount ?? 0,
            total: item.total,
          })),
        },
        ...(paidAmount > 0 && payment ? {
          payments: {
            create: {
              amount: paidAmount,
              method: payment.method ?? "Cash",
              reference: payment.reference || null,
              date: payment.date ? new Date(payment.date) : new Date(),
              notes: payment.notes || null,
            },
          },
        } : {}),
      },
      include: BILL_INCLUDE,
    });

    await logActivity(session.user.id, "create_purchase_bill", `Created purchase bill ${billNumber} from ${bill.vendor.name} — ₹${billTotal}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create purchase bill" }, { status: 500 });
  }
}
