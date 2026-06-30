import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const vendor = await prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      include: {
        purchaseBills: {
          where: { deletedAt: null },
          select: { id: true, billNumber: true, billDate: true, total: true, paidAmount: true, status: true },
          orderBy: { billDate: "desc" },
        },
      },
    });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    return NextResponse.json(vendor);
  } catch {
    return NextResponse.json({ error: "Failed to fetch vendor" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { name, company, gstin, phone, email, address, notes, isActive } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        name: name.trim(), company: company?.trim() || null,
        gstin: gstin?.trim() || null, phone: phone?.trim() || null,
        email: email?.trim() || null, address: address?.trim() || null,
        notes: notes?.trim() || null, isActive: isActive !== false,
      },
    });
    await logActivity(session.user.id, "update_vendor", `Updated vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json(vendor);
  } catch {
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const vendor = await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(session.user.id, "delete_vendor", `Deleted vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json({ message: "Vendor deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}
