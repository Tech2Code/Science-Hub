import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCustomers } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";
import { validateCustomerInput } from "@/lib/validation";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const customers = await getCustomers();
    const ids = customers.map((c) => c.id);
    const logs = await prisma.activityLog.findMany({
      where: { entityId: { in: ids }, action: "add_customer" },
      select: { entityId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const createdByMap = new Map(logs.map((l) => [l.entityId, l.user.name]));
    const result = customers.map((c) => ({ ...c, createdBy: createdByMap.get(c.id) ?? null }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
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
