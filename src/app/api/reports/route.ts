import { NextRequest, NextResponse } from "next/server";
import { getReportSummary, getReportOutstanding, getReportStock } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSectionAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { Prisma } from "@prisma/client";

async function getSalesDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [revenueAgg, collectedAgg, outstandingAgg, overdueCount, recentInvoices, topCustomerAggs] = await Promise.all([
    prisma.invoice.aggregate({
      where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null },
      _sum: { paidAmount: true },
    }),
    // balanceDue is a real Postgres GENERATED column — sum it in the DB rather than fetching every row to reduce in JS.
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
      _sum: { balanceDue: true },
    }),
    prisma.invoice.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart } },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 10,
      include: { customer: { select: { name: true } } },
    }),
    // Top 5 computed by the DB (groupBy + orderBy + take) instead of fetching every customer's invoices to sort in JS. Excludes soft-deleted customers from the ranking.
    prisma.invoice.groupBy({
      by: ["customerId"],
      where: { deletedAt: null, customer: { deletedAt: null } },
      _sum: { total: true, paidAmount: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const outstandingBalance = outstandingAgg._sum.balanceDue ?? 0;

  const topCustomerNames = await prisma.customer.findMany({
    where: { id: { in: topCustomerAggs.map((c) => c.customerId) } },
    select: { id: true, name: true },
  });
  const topCustomerNameMap = new Map(topCustomerNames.map((c) => [c.id, c.name]));
  const topCustomers = topCustomerAggs.map((c) => ({
    id: c.customerId,
    name: topCustomerNameMap.get(c.customerId) ?? "Unknown",
    totalBilled: c._sum.total ?? 0,
    totalPaid: c._sum.paidAmount ?? 0,
  }));

  // Financial year monthly revenue (Apr–Mar)
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(fyYear, 3, 1);
  const fyLabel = `FY ${fyYear}-${String(fyYear + 1).slice(2)}`;
  // One query for the whole FY, grouped in JS — 12 "parallel" per-month aggregates would still serialize through the pooled connection_limit=1 DB anyway.
  const fyEnd = new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 1);
  const fyInvoices = await prisma.invoice.findMany({
    where: { deletedAt: null, date: { gte: fyStart, lt: fyEnd } },
    select: { date: true, total: true },
  });
  const monthlyRevenue: { month: string; total: number }[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStart.getFullYear(), fyStart.getMonth() + i, 1);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (d > now) return { month: label, total: 0 };
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const total = fyInvoices
      .filter((inv) => inv.date >= d && inv.date < end)
      .reduce((sum, inv) => sum + inv.total, 0);
    return { month: label, total };
  });

  return {
    revenueThisMonth: revenueAgg._sum.total ?? 0,
    totalCollected: collectedAgg._sum.paidAmount ?? 0,
    outstandingBalance,
    overdueCount,
    monthlyRevenue,
    fyLabel,
    recentInvoices: recentInvoices.map((inv) => ({
      id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
      customerName: inv.customer.name, total: inv.total, paidAmount: inv.paidAmount, status: inv.status,
    })),
    topCustomers,
  };
}

async function getPurchaseDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [spendAgg, paidAgg, payableAgg, overdueCount, recentBills, topVendorAggs] = await Promise.all([
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    }),
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { not: "cancelled" } },
      _sum: { paidAmount: true },
    }),
    // Same fix as getSalesDashboard's outstandingBalance — DB-side sum of the generated balanceDue column.
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
      _sum: { balanceDue: true },
    }),
    prisma.purchaseBill.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart } },
    }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null },
      orderBy: { billDate: "desc" },
      take: 10,
      include: { vendor: { select: { name: true } } },
    }),
    // Same fix as getSalesDashboard's topCustomers — DB-side groupBy + take(5); cancelled bills excluded since their stock effect was reversed.
    prisma.purchaseBill.groupBy({
      by: ["vendorId"],
      where: { deletedAt: null, status: { not: "cancelled" }, vendor: { deletedAt: null } },
      _sum: { total: true, paidAmount: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const payableBalance = payableAgg._sum.balanceDue ?? 0;

  const topVendorNames = await prisma.vendor.findMany({
    where: { id: { in: topVendorAggs.map((v) => v.vendorId) } },
    select: { id: true, name: true },
  });
  const topVendorNameMap = new Map(topVendorNames.map((v) => [v.id, v.name]));
  const topVendors = topVendorAggs.map((v) => ({
    id: v.vendorId,
    name: topVendorNameMap.get(v.vendorId) ?? "Unknown",
    totalBilled: v._sum.total ?? 0,
    totalPaid: v._sum.paidAmount ?? 0,
  }));

  // Financial year monthly spend (Apr–Mar)
  const fyYearP = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStartP = new Date(fyYearP, 3, 1);
  const fyLabelP = `FY ${fyYearP}-${String(fyYearP + 1).slice(2)}`;
  // Same fix as monthlyRevenue — one query for the whole FY, grouped in JS.
  const fyEndP = new Date(fyStartP.getFullYear() + 1, fyStartP.getMonth(), 1);
  const fyBills = await prisma.purchaseBill.findMany({
    where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: fyStartP, lt: fyEndP } },
    select: { billDate: true, total: true },
  });
  const monthlySpend: { month: string; total: number }[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(fyStartP.getFullYear(), fyStartP.getMonth() + i, 1);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (d > now) return { month: label, total: 0 };
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const total = fyBills
      .filter((b) => b.billDate >= d && b.billDate < end)
      .reduce((sum, b) => sum + b.total, 0);
    return { month: label, total };
  });

  return {
    spendThisMonth: spendAgg._sum.total ?? 0,
    totalPaid: paidAgg._sum.paidAmount ?? 0,
    payableBalance,
    overdueBillsCount: overdueCount,
    monthlySpend,
    fyLabel: fyLabelP,
    recentBills: recentBills.map((b) => ({
      id: b.id, billNumber: b.billNumber, billDate: b.billDate,
      vendorName: b.vendor.name, total: b.total, paidAmount: b.paidAmount, status: b.status,
    })),
    topVendors,
  };
}

async function getCombinedDashboard(canSeeSales: boolean, canSeePurchases: boolean) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [
    salesMonthAgg, salesOutstandingAgg, salesOverdue, collectedTodayAgg,
    spendMonthAgg, purchaseUnpaidAgg, purchaseOverdue, paidTodayAgg,
    recentInvoices, recentBills, lowStockCount,
  ] = await Promise.all([
    prisma.invoice.aggregate({ where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } }, _sum: { total: true } }),
    // balanceDue is a real Postgres GENERATED column — sum it in the DB rather than reducing every row in JS (same fix as getSalesDashboard/getPurchaseDashboard).
    prisma.invoice.aggregate({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] } }, _sum: { balanceDue: true } }),
    prisma.invoice.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart } } }),
    prisma.payment.aggregate({ where: { date: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
    prisma.purchaseBill.aggregate({ where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: monthStart, lt: monthEnd } }, _sum: { total: true } }),
    prisma.purchaseBill.aggregate({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] } }, _sum: { balanceDue: true } }),
    prisma.purchaseBill.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart } } }),
    prisma.purchasePayment.aggregate({ where: { date: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { deletedAt: null }, orderBy: { date: "desc" }, take: 5, include: { customer: { select: { name: true } } } }),
    prisma.purchaseBill.findMany({ where: { deletedAt: null }, orderBy: { billDate: "desc" }, take: 5, include: { vendor: { select: { name: true } } } }),
    // isLowStock is also a real Postgres GENERATED column — a plain count against it instead of fetching every product to filter in JS.
    prisma.product.count({ where: { deletedAt: null, isLowStock: true } }),
  ]);

  // Redact sales/purchase figures server-side for callers not granted the matching section — the dashboard's own client-side hiding isn't sufficient on its own.
  return {
    sales: canSeeSales ? {
      revenueThisMonth: salesMonthAgg._sum.total ?? 0,
      outstandingAmount: salesOutstandingAgg._sum.balanceDue ?? 0,
      overdueInvoices: salesOverdue,
      collectedToday: collectedTodayAgg._sum.amount ?? 0,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
        customerName: inv.customer.name, total: inv.total, paidAmount: inv.paidAmount, status: inv.status,
      })),
    } : null,
    purchases: canSeePurchases ? {
      spendThisMonth: spendMonthAgg._sum.total ?? 0,
      payableBalance: purchaseUnpaidAgg._sum.balanceDue ?? 0,
      overdueBills: purchaseOverdue,
      paidToday: paidTodayAgg._sum.amount ?? 0,
      recentBills: recentBills.map((b) => ({
        id: b.id, billNumber: b.billNumber, billDate: b.billDate,
        vendorName: b.vendor.name, total: b.total, paidAmount: b.paidAmount, status: b.status,
      })),
    } : null,
    lowStockCount,
  };
}

async function getGstSummary(startDate?: string, endDate?: string) {
  // Stays scoped to "all invoices" when no range is picked (matches the Sales Reports page's own
  // label) — the aggregation itself is pushed into Postgres via date_trunc/groupBy so this never
  // has to load every invoice row into Node to bucket by month, regardless of table size.
  const gte = startDate ? new Date(startDate) : undefined;
  const lte = endDate ? new Date(endDate) : undefined;

  const rows = await prisma.$queryRaw<Array<{ month: Date; taxableValue: number; cgst: number; sgst: number; igst: number }>>`
    SELECT date_trunc('month', "date") AS month,
           COALESCE(SUM("subtotal"), 0) AS "taxableValue",
           COALESCE(SUM("cgst"), 0) AS cgst,
           COALESCE(SUM("sgst"), 0) AS sgst,
           COALESCE(SUM("igst"), 0) AS igst
    FROM "Invoice"
    WHERE "deletedAt" IS NULL
      ${gte ? Prisma.sql`AND "date" >= ${gte}` : Prisma.empty}
      ${lte ? Prisma.sql`AND "date" <= ${lte}` : Prisma.empty}
    GROUP BY month
    ORDER BY month ASC
  `;

  return rows.map((r) => ({
    month: new Date(r.month).toLocaleString("en-IN", { month: "short", year: "numeric" }),
    taxableValue: Number(r.taxableValue) || 0,
    cgst: Number(r.cgst) || 0,
    sgst: Number(r.sgst) || 0,
    igst: Number(r.igst) || 0,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    if (!type) {
      return NextResponse.json({ error: "Query parameter 'type' is required" }, { status: 400 });
    }
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }

    // Enforce the same ProtectedSection gate server-side so a staff/manager without access can't bypass the UI redirect by calling the API directly.
    if (type === "summary" || type === "outstanding" || type === "gst-summary") {
      const gate = await requireSectionAccess("reports_sales");
      if (!gate.ok) return gate.response;
    }
    if (type === "sales-dashboard") {
      const gate = await requireSectionAccess("sales_overview");
      if (!gate.ok) return gate.response;
    }
    if (type === "purchase-dashboard") {
      const gate = await requireSectionAccess("purchase_overview");
      if (!gate.ok) return gate.response;
    }

    if (type === "summary")            return NextResponse.json(await getReportSummary());
    if (type === "outstanding") {
      const { skip, take } = parsePageParams(searchParams, 2000);
      return NextResponse.json(await getReportOutstanding(startDate, endDate, skip, take));
    }
    if (type === "stock")              return NextResponse.json(await getReportStock());
    if (type === "sales-dashboard")    return NextResponse.json(await getSalesDashboard());
    if (type === "purchase-dashboard") return NextResponse.json(await getPurchaseDashboard());
    if (type === "combined-dashboard") {
      const role = auth.session.user.role;
      const sections = Array.isArray(auth.session.user.sections) ? auth.session.user.sections : [];
      const canSeeSales = role === "admin" || sections.includes("sales_overview");
      const canSeePurchases = role === "admin" || sections.includes("purchase_overview");
      return NextResponse.json(await getCombinedDashboard(canSeeSales, canSeePurchases));
    }
    if (type === "gst-summary")        return NextResponse.json(await getGstSummary(startDate, endDate));

    return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
