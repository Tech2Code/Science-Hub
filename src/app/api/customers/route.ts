import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomers } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

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

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: { name, phone, email, address, city, state, pincode, gstin },
    });

    await logActivity(auth.session.user.id, "add_customer", `Added customer "${name}" | Phone: ${phone || "—"} | City: ${city || "—"} | GSTIN: ${gstin || "—"}`, customer.id, "customer");
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
