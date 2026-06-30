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

    const bill = await prisma.purchaseBill.update({
      where: { id },
      data: {
        ...(vendorId && { vendorId }),
        ...(billDate && { billDate: new Date(billDate) }),
        dueDate: dueDate ? new Date(dueDate) : null,
        ...(subtotal !== undefined && { subtotal }),
        ...(taxAmount !== undefined && { taxAmount }),
        ...(discount !== undefined && { discount }),
        ...(total !== undefined && { total }),
        notes: notes ?? null,
        category: category ?? null,
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
    const bill = await prisma.purchaseBill.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(session.user.id, "delete_purchase_bill", `Deleted purchase bill ${bill.billNumber}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    return NextResponse.json({ message: "Bill deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
