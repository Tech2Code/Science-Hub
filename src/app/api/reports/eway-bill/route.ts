import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { istDayStartUtc, istDayEndUtc } from "@/lib/validation";
import { EWAY_BILL_THRESHOLD } from "@/lib/ewayBill";

// Same all-or-nothing gate as /api/gst-filing — this report merges sales + purchase data.
async function requireGstFilingAccess() {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  const { role, sections } = auth.session.user;
  if (role === "admin") return auth;
  const userSections = Array.isArray(sections) ? sections : [];
  if (!userSections.includes("reports_sales") || !userSections.includes("reports_purchases")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "E-way Bill report requires both Sales Reports and Purchase Reports access." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireGstFilingAccess();
    if (!auth.ok) return auth.response;

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
    const dateFilter = from || to ? { ...(from && { gte: from }), ...(to && { lte: to }) } : undefined;

    const [invoices, bills] = await Promise.all([
      prisma.invoice.findMany({
        where: { deletedAt: null, total: { gte: EWAY_BILL_THRESHOLD }, ...(dateFilter && { date: dateFilter }) },
        select: { id: true, invoiceNumber: true, date: true, placeOfSupply: true, isInterState: true, total: true, customer: { select: { name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.purchaseBill.findMany({
        where: { deletedAt: null, status: { not: "cancelled" }, total: { gte: EWAY_BILL_THRESHOLD }, ...(dateFilter && { billDate: dateFilter }) },
        select: { id: true, billNumber: true, billDate: true, placeOfSupply: true, isInterState: true, total: true, vendor: { select: { name: true } } },
        orderBy: { billDate: "asc" },
      }),
    ]);

    return NextResponse.json({
      threshold: EWAY_BILL_THRESHOLD,
      sales: invoices.map((inv) => ({
        id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date, customerName: inv.customer.name,
        placeOfSupply: inv.placeOfSupply, isInterState: inv.isInterState, total: inv.total,
      })),
      purchases: bills.map((b) => ({
        id: b.id, billNumber: b.billNumber, billDate: b.billDate, vendorName: b.vendor.name,
        placeOfSupply: b.placeOfSupply, isInterState: b.isInterState, total: b.total,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to build E-way Bill report" }, { status: 500 });
  }
}
