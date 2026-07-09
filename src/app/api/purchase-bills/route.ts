import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { recordStockMovement } from "@/lib/stockMovement";
import { isPurchaseBillBlobUrl } from "@/lib/blobStorage";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: {
        select: {
          id: true, name: true, unit: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  },
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
    const userId = session.user.id;

    const body = await req.json();
    const { vendorId, billDate, dueDate, discount, notes, category, items, payment, attachmentUrl, attachmentName } = body;

    if (!vendorId) return NextResponse.json({ error: "Vendor is required." }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
    if (attachmentUrl && !isPurchaseBillBlobUrl(attachmentUrl)) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const parsedBillDate = new Date(billDate ?? Date.now());
      if (parsedDueDate < parsedBillDate) {
        return NextResponse.json({ error: "Due date cannot be before the bill date" }, { status: 400 });
      }
    }

    for (const item of items as { quantity: number; purchasePrice: number }[]) {
      const quantity = parseFloat(String(item.quantity));
      const purchasePrice = parseFloat(String(item.purchasePrice));
      if (!(quantity > 0)) return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
      if (!(purchasePrice >= 0)) return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
    }

    // Recompute every item's GST/total server-side from quantity × price × rate —
    // mirrors the invoices route, so a stale or tampered client-sent total/GST
    // can never get persisted as the bill's authoritative amount.
    const computedItems = (items as {
      productId?: string; name: string; quantity: number;
      unit?: string; purchasePrice: number; gstRate?: number;
    }[]).map((item) => {
      const quantity = parseFloat(String(item.quantity));
      const purchasePrice = parseFloat(String(item.purchasePrice));
      const gstRate = parseFloat(String(item.gstRate ?? 0));
      const itemSubtotal = quantity * purchasePrice;
      const gstAmount = itemSubtotal * gstRate / 100;
      return { ...item, quantity, purchasePrice, gstRate, gstAmount, total: itemSubtotal + gstAmount, itemSubtotal };
    });
    const subtotal = computedItems.reduce((s, i) => s + i.itemSubtotal, 0);
    const taxAmount = computedItems.reduce((s, i) => s + i.gstAmount, 0);
    const parsedDiscount = discount !== undefined && discount !== null && discount !== "" ? parseFloat(String(discount)) : 0;
    if (Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
      return NextResponse.json({ error: "Discount cannot be negative" }, { status: 400 });
    }

    const payAmt = payment?.amount ?? 0;
    const billTotal = subtotal + taxAmount - parsedDiscount;
    if (billTotal < 0) return NextResponse.json({ error: "Discount cannot exceed the bill total" }, { status: 400 });
    const paidAmount = Math.min(payAmt, billTotal);
    const status = paidAmount >= billTotal && billTotal > 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
    const year = new Date(billDate ?? Date.now()).getFullYear();

    // Bill-number generation and the create both run inside one Serializable
    // transaction, with a retry on the write-conflict Postgres reports when
    // two requests race for the same number.
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        const prefix = `PB-${year}-`;
        const last = await tx.purchaseBill.findFirst({
          where: { billNumber: { startsWith: prefix } },
          orderBy: { billNumber: "desc" },
        });
        const seq = last ? parseInt(last.billNumber.split("-")[2] ?? "0") + 1 : 1;
        const billNumber = `${prefix}${String(seq).padStart(4, "0")}`;

        const created = await tx.purchaseBill.create({
          data: {
            billNumber,
            vendorId,
            billDate: billDate ? new Date(billDate) : new Date(),
            dueDate: dueDate ? new Date(dueDate) : null,
            subtotal,
            taxAmount,
            discount: parsedDiscount,
            total: billTotal,
            paidAmount,
            status,
            notes: notes || null,
            category: category || null,
            attachmentUrl: attachmentUrl || null,
            attachmentName: attachmentName || null,
            createdByUserId: userId,
            items: {
              create: computedItems.map((item) => ({
                productId: item.productId || null,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit ?? "Nos",
                purchasePrice: item.purchasePrice,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount,
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

        // A purchase bill's whole point is restocking — without this, inventory
        // only ever drains via sales and never gets replenished.
        const stockedItems = computedItems.filter(item => item.productId);
        for (const item of stockedItems) {
          const product = await tx.product.update({
            where: { id: item.productId! },
            data: { stock: { increment: item.quantity } },
            select: { id: true, stock: true },
          });
          await recordStockMovement(tx, {
            productId: product.id,
            type: "purchase",
            quantity: item.quantity,
            balanceAfter: product.stock,
            reference: created.billNumber,
            purchaseBillId: created.id,
            createdByUserId: userId,
          });
        }

        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
    }

    const maxAttempts = 5;
    let bill: Awaited<ReturnType<typeof attemptCreate>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        bill = await attemptCreate();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }
    if (!bill) throw new Error("Failed to create purchase bill after retries");

    await logActivity(session.user.id, "create_purchase_bill", `Created purchase bill ${bill.billNumber} from ${bill.vendor.name} — ₹${billTotal}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create purchase bill" }, { status: 500 });
  }
}
