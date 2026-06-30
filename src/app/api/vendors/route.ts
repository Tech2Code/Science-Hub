import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const vendors = await prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { purchaseBills: { where: { deletedAt: null } } } } },
    });
    return NextResponse.json(vendors);
  } catch {
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, company, gstin, phone, email, address, notes, isActive } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });

    const vendor = await prisma.vendor.create({
      data: {
        name: name.trim(), company: company?.trim() || null,
        gstin: gstin?.trim() || null, phone: phone?.trim() || null,
        email: email?.trim() || null, address: address?.trim() || null,
        notes: notes?.trim() || null, isActive: isActive !== false,
      },
    });
    await logActivity(session.user.id, "add_vendor", `Created vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json(vendor, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
