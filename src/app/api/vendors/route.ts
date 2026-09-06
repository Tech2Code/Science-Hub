import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
    const { name, company, gstin, phone, email, address, city, state, pincode, notes, isActive, oneOff, idempotencyKey } = body;

    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length > 200)) {
      return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    }
    // A retried/duplicated create submission (double-click, network retry) of the same
    // client-generated key is a no-op — return the vendor that submission already created
    // rather than creating a second row.
    if (idempotencyKey) {
      const existing = await prisma.vendor.findUnique({ where: { idempotencyKey } });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const validationError = validateVendorInput({ name, company, phone, email, gstin, address, city, state, pincode, notes }, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    // "Just for this bill" vendors still need a real row (required FK) but are soft-deleted at creation to stay out of the directory/search.
    const isOneOff = oneOff === true;
    let vendor;
    try {
      vendor = await prisma.vendor.create({
        data: {
          name: name.trim(), company: company?.trim() || null,
          gstin: gstin?.trim() || null, phone: phone?.trim() || null,
          email: email?.trim() || null, address: address?.trim() || null,
          city: city?.trim() || null, state: state?.trim() || null, pincode: pincode?.trim() || null,
          notes: notes?.trim() || null, isActive: isActive !== false,
          idempotencyKey: idempotencyKey || null,
          ...(isOneOff ? { deletedAt: new Date() } : {}),
        },
      });
    } catch (error) {
      // Two near-simultaneous requests carrying the same idempotency key can both pass the
      // pre-check above and race to insert — the loser hits the unique constraint here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        && Array.isArray((error.meta as { target?: unknown })?.target)
        && (error.meta as { target: string[] }).target.includes("idempotencyKey")) {
        const racing = idempotencyKey ? await prisma.vendor.findUnique({ where: { idempotencyKey } }) : null;
        if (racing) return NextResponse.json(racing, { status: 200 });
      }
      throw error;
    }
    if (isOneOff) {
      await logActivity(auth.session.user.id, "add_vendor", `Created one-off vendor "${vendor.name}" (via purchase bill, not saved to directory)`, vendor.id, "vendor");
    } else {
      await logActivity(auth.session.user.id, "add_vendor", `Created vendor "${vendor.name}"`, vendor.id, "vendor");
      revalidateTag("vendors", { expire: 0 });
    }
    return NextResponse.json(vendor, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
