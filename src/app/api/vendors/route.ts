import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { validateVendorInput } from "@/lib/validation";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { buildVendorWhere, buildVendorOrderBy, type VendorSort } from "@/lib/vendorQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as VendorSort | undefined;
    const { skip, take } = parsePageParams(searchParams, 2000);

    const where = buildVendorWhere(search);
    const [data, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        orderBy: buildVendorOrderBy(sort),
        skip,
        take,
        include: { _count: { select: { purchaseBills: { where: { deletedAt: null } } } } },
      }),
      prisma.vendor.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch {
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { name, company, gstin, phone, email, address, city, state, pincode, notes, isActive } = body;
    const validationError = validateVendorInput({ name, phone, email, gstin, address, city, state, pincode }, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const vendor = await prisma.vendor.create({
      data: {
        name: name.trim(), company: company?.trim() || null,
        gstin: gstin?.trim() || null, phone: phone?.trim() || null,
        email: email?.trim() || null, address: address?.trim() || null,
        city: city?.trim() || null, state: state?.trim() || null, pincode: pincode?.trim() || null,
        notes: notes?.trim() || null, isActive: isActive !== false,
      },
    });
    await logActivity(auth.session.user.id, "add_vendor", `Created vendor "${vendor.name}"`, vendor.id, "vendor");
    revalidateTag("vendors", { expire: 0 });
    return NextResponse.json(vendor, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
