import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCustomers, type CustomerSort } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateCustomerInput, parseCreditLimit } from "@/lib/validation";
import { parsePageParams } from "@/lib/listQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as CustomerSort | undefined;
    const { skip, take } = parsePageParams(searchParams, 5000);

    const { data, total } = await getCustomers(search, sort, skip, take);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, phone, email, address, city, state, pincode, gstin, creditLimit, oneOff, idempotencyKey } = body;

    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length > 200)) {
      return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    }
    // A retried/duplicated create submission (double-click, network retry) of the same
    // client-generated key is a no-op — return the customer that submission already created
    // rather than creating a second row.
    if (idempotencyKey) {
      const existing = await prisma.customer.findUnique({ where: { idempotencyKey } });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const validationError = validateCustomerInput({ name, phone, email, address, city, state, pincode, gstin, creditLimit }, true);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // "Just for this invoice" customers still need a real Customer row (required FK), so they're
    // soft-deleted at creation to stay out of the directory/search. Mirrors the vendor one-off pattern.
    const isOneOff = oneOff === true;
    let customer;
    try {
      customer = await prisma.customer.create({
        data: {
          name: name.trim(), phone, email, address, city, state, pincode, gstin, creditLimit: parseCreditLimit(creditLimit),
          idempotencyKey: idempotencyKey || null,
          ...(isOneOff ? { deletedAt: new Date() } : {}),
        },
      });
    } catch (error) {
      // Two near-simultaneous requests carrying the same idempotency key can both pass the
      // pre-check above (neither has committed yet) and race to insert — the loser hits the
      // unique constraint here. Treat it the same as the pre-check hit rather than a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        && Array.isArray((error.meta as { target?: unknown })?.target)
        && (error.meta as { target: string[] }).target.includes("idempotencyKey")) {
        const racing = idempotencyKey ? await prisma.customer.findUnique({ where: { idempotencyKey } }) : null;
        if (racing) return NextResponse.json(racing, { status: 200 });
      }
      throw error;
    }

    if (isOneOff) {
      await logActivity(auth.session.user.id, "add_customer", `Created one-off customer "${customer.name}" (via invoice, not saved to directory)`, customer.id, "customer");
    } else {
      await logActivity(auth.session.user.id, "add_customer", `Added customer "${customer.name}" | Phone: ${phone || "—"} | City: ${city || "—"} | GSTIN: ${gstin || "—"}`, customer.id, "customer");
      revalidateTag("customers", { expire: 0 });
    }
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
