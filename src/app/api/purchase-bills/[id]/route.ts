import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, phone: true, email: true, gstin: true, address: true } },
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  payments: { orderBy: { date: "desc" as const } },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const bill = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null }, include: BILL_INCLUDE });
    if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    return NextResponse.json(bill);
  } catch {
    return NextResponse.json({ error: "Failed to fetch bill" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { vendorId, billDate, dueDate, subtotal, taxAmount, discount, total, notes, category, status } = body;

    const existing = await prisma.purchaseBill.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    if (status === "paid") {
      const effectiveTotal = total !== undefined ? total : existing.total;
      if (existing.paidAmount + 0.01 < effectiveTotal) {
        return NextResponse.json(
          { error: "Cannot mark as paid — recorded payments don't cover the full total yet." },
          { status: 400 }
        );
      }
    }

    const bill = await prisma.purchaseBill.update({
      where: { id },
      data: {
        ...(vendorId && { vendorId }),
        ...(billDate && { billDate: new Date(billDate) }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(subtotal !== undefined && { subtotal }),
        ...(taxAmount !== undefined && { taxAmount }),
        ...(discount !== undefined && { discount }),
        ...(total !== undefined && { total }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(category !== undefined && { category: category || null }),
        ...(status && { status }),
      },
      include: BILL_INCLUDE,
    });

    await logActivity(session.user.id, "update_purchase_bill", `Updated purchase bill ${bill.billNumber}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    return NextResponse.json(bill);
  } catch {
    return NextResponse.json({ error: "Failed to update bill" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    // Reverse the stock this bill added at creation — and guard against a
    // repeated delete call double-reversing it.
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.purchaseBill.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updateResult.count === 0) return null;

      const items = await tx.purchaseBillItem.findMany({
        where: { purchaseBillId: id },
        select: { productId: true, quantity: true },
      });
      await Promise.all(
        items.filter(item => item.productId).map(item =>
          tx.product.update({ where: { id: item.productId! }, data: { stock: { decrement: item.quantity } } })
        )
      );
      return tx.purchaseBill.findUnique({ where: { id }, select: { billNumber: true } });
    });

    if (!result) return NextResponse.json({ message: "Bill already deleted" });

    await logActivity(session.user.id, "delete_purchase_bill", `Deleted purchase bill ${result.billNumber}`, id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ message: "Bill deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
