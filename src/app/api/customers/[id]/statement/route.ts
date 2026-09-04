import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { buildLedger, fetchCustomerLedgerEntries } from "@/lib/statementQuery";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const customer = await prisma.customer.findFirst({
      where: { id, OR: [{ deletedAt: null }, { invoices: { some: { deletedAt: null } } }] },
      select: { id: true, name: true, phone: true, email: true, address: true, city: true, state: true, pincode: true, gstin: true },
    });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const from = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
    const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : undefined;

    const entries = await fetchCustomerLedgerEntries(id);
    const ledger = buildLedger(entries, from, to);

    return NextResponse.json({ customer, ...ledger });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to build statement" }, { status: 500 });
  }
}
