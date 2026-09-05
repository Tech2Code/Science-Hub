import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSectionAccess } from "@/lib/apiAuth";
import { istDayStartUtc, istDayEndUtc } from "@/lib/validation";
import { buildLedger, fetchCustomerLedgerEntries } from "@/lib/statementQuery";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSectionAccess("payments_received");
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
    const from = fromStr ? istDayStartUtc(fromStr) : undefined;
    const to = toStr ? istDayEndUtc(toStr) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const { entries, openingBalanceSeed } = await fetchCustomerLedgerEntries(id, from, to);
    const ledger = buildLedger(entries, from, to, openingBalanceSeed);

    return NextResponse.json({ customer, ...ledger });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to build statement" }, { status: 500 });
  }
}
