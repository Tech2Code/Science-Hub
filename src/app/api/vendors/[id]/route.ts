import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { validateVendorInput } from "@/lib/validation";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
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
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await req.json();
    const { name, company, gstin, phone, email, address, notes, isActive, expectedUpdatedAt } = body;
    const validationError = validateVendorInput({ name, phone, email, gstin });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await prisma.vendor.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true } });
    if (!existing) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This vendor is in the bin — restore it before editing" }, { status: 400 });
    }
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This vendor was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        name: name.trim(), company: company?.trim() || null,
        gstin: gstin?.trim() || null, phone: phone?.trim() || null,
        email: email?.trim() || null, address: address?.trim() || null,
        notes: notes?.trim() || null, isActive: isActive !== false,
      },
    });
    await logActivity(auth.session.user.id, "update_vendor", `Updated vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json(vendor);
  } catch {
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const existing = await prisma.vendor.findUnique({ where: { id }, select: { name: true } });
    if (!existing) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    const activeBillCount = await prisma.purchaseBill.count({ where: { vendorId: id, deletedAt: null } });
    if (activeBillCount > 0) {
      return NextResponse.json(
        { error: `"${existing.name}" has ${activeBillCount} active purchase bill(s) and cannot be deleted. Delete those bills first.` },
        { status: 400 }
      );
    }
    const vendor = await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(auth.session.user.id, "delete_vendor", `Deleted vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json({ message: "Vendor deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}
