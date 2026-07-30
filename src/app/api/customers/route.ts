import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCustomers, type CustomerSort } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateCustomerInput } from "@/lib/validation";
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
    const { name, phone, email, address, city, state, pincode, gstin } = body;

    const validationError = validateCustomerInput({ name, phone, email, pincode, gstin });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: { name: name.trim(), phone, email, address, city, state, pincode, gstin },
    });

    await logActivity(auth.session.user.id, "add_customer", `Added customer "${customer.name}" | Phone: ${phone || "—"} | City: ${city || "—"} | GSTIN: ${gstin || "—"}`, customer.id, "customer");
    revalidateTag("customers", { expire: 0 });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
