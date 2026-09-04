import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { buildLedger, fetchVendorLedgerEntries } from "@/lib/statementQuery";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const vendor = await prisma.vendor.findFirst({
      where: { id, OR: [{ deletedAt: null }, { purchaseBills: { some: { deletedAt: null } } }] },
      select: { id: true, name: true, company: true, phone: true, email: true, address: true, city: true, state: true, pincode: true, gstin: true },
    });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const from = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
    const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : undefined;

    const entries = await fetchVendorLedgerEntries(id);
    const ledger = buildLedger(entries, from, to);

    return NextResponse.json({ vendor, ...ledger });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to build statement" }, { status: 500 });
  }
}
