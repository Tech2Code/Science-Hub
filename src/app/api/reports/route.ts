import { NextRequest, NextResponse } from "next/server";
import { getReportSummary, getReportOutstanding, getReportStock } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";

async function getSalesDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [revenueAgg, collectedAgg, unpaidInvoices, overdueCount, recentInvoices, customers] = await Promise.all([
    prisma.invoice.aggregate({
      where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null },
      _sum: { paidAmount: true },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
      select: { total: true, paidAmount: true, dueDate: true },
    }),
    prisma.invoice.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: now } },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 10,
      include: { customer: { select: { name: true } } },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      include: { invoices: { where: { deletedAt: null }, select: { total: true, paidAmount: true } } },
    }),
  ]);

  const outstandingBalance = unpaidInvoices.reduce((s, i) => s + (i.total - i.paidAmount), 0);

  const topCustomers = customers
    .map((c) => ({
      id: c.id,
      name: c.name,
      totalBilled: c.invoices.reduce((s, i) => s + i.total, 0),
      totalPaid: c.invoices.reduce((s, i) => s + i.paidAmount, 0),
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled)
    .slice(0, 5);

  // Financial year monthly revenue (Apr–Mar)
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(fyYear, 3, 1);
  const fyLabel = `FY ${fyYear}-${String(fyYear + 1).slice(2)}`;
  const monthlyRevenue: { month: string; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(fyStart.getFullYear(), fyStart.getMonth() + i, 1);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (d > now) { monthlyRevenue.push({ month: label, total: 0 }); continue; }
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const agg = await prisma.invoice.aggregate({
      where: { deletedAt: null, date: { gte: d, lt: end } },
      _sum: { total: true },
    });
    monthlyRevenue.push({ month: label, total: agg._sum.total ?? 0 });
  }

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

  const [spendAgg, paidAgg, unpaidBills, overdueCount, recentBills, vendors] = await Promise.all([
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, billDate: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    }),
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null },
      _sum: { paidAmount: true },
    }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
      select: { total: true, paidAmount: true, dueDate: true },
    }),
    prisma.purchaseBill.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: now } },
    }),
    prisma.purchaseBill.findMany({
      where: { deletedAt: null },
      orderBy: { billDate: "desc" },
      take: 10,
      include: { vendor: { select: { name: true } } },
    }),
    prisma.vendor.findMany({
      include: { purchaseBills: { where: { deletedAt: null }, select: { total: true, paidAmount: true } } },
    }),
  ]);

  const payableBalance = unpaidBills.reduce((s, b) => s + (b.total - b.paidAmount), 0);

  const topVendors = vendors
    .map((v) => ({
      id: v.id, name: v.name,
      totalBilled: v.purchaseBills.reduce((s, b) => s + b.total, 0),
      totalPaid: v.purchaseBills.reduce((s, b) => s + b.paidAmount, 0),
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled)
    .slice(0, 5);

  // Financial year monthly spend (Apr–Mar)
  const fyYearP = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStartP = new Date(fyYearP, 3, 1);
  const fyLabelP = `FY ${fyYearP}-${String(fyYearP + 1).slice(2)}`;
  const monthlySpend: { month: string; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(fyStartP.getFullYear(), fyStartP.getMonth() + i, 1);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (d > now) { monthlySpend.push({ month: label, total: 0 }); continue; }
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const agg = await prisma.purchaseBill.aggregate({
      where: { deletedAt: null, billDate: { gte: d, lt: end } },
      _sum: { total: true },
    });
    monthlySpend.push({ month: label, total: agg._sum.total ?? 0 });
  }

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

async function getCombinedDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [
    salesMonthAgg, salesOutstanding, salesOverdue, collectedTodayAgg,
    spendMonthAgg, purchaseUnpaid, purchaseOverdue, paidTodayAgg,
    recentInvoices, recentBills, lowStockCount,
  ] = await Promise.all([
    prisma.invoice.aggregate({ where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } }, _sum: { total: true } }),
    prisma.invoice.findMany({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] } }, select: { total: true, paidAmount: true } }),
    prisma.invoice.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: now } } }),
    prisma.payment.aggregate({ where: { date: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
    prisma.purchaseBill.aggregate({ where: { deletedAt: null, billDate: { gte: monthStart, lt: monthEnd } }, _sum: { total: true } }),
    prisma.purchaseBill.findMany({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] } }, select: { total: true, paidAmount: true } }),
    prisma.purchaseBill.count({ where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: now } } }),
    prisma.purchasePayment.aggregate({ where: { date: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { deletedAt: null }, orderBy: { date: "desc" }, take: 5, include: { customer: { select: { name: true } } } }),
    prisma.purchaseBill.findMany({ where: { deletedAt: null }, orderBy: { billDate: "desc" }, take: 5, include: { vendor: { select: { name: true } } } }),
    prisma.product.count({ where: { deletedAt: null } }).then(async () => {
      const prods = await prisma.product.findMany({ where: { deletedAt: null }, select: { stock: true, minStock: true } });
      return prods.filter((p) => p.stock < p.minStock).length;
    }),
  ]);

  return {
    sales: {
      revenueThisMonth: salesMonthAgg._sum.total ?? 0,
      outstandingAmount: salesOutstanding.reduce((s, i) => s + (i.total - i.paidAmount), 0),
      overdueInvoices: salesOverdue,
      collectedToday: collectedTodayAgg._sum.amount ?? 0,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
        customerName: inv.customer.name, total: inv.total, paidAmount: inv.paidAmount, status: inv.status,
      })),
    },
    purchases: {
      spendThisMonth: spendMonthAgg._sum.total ?? 0,
      payableBalance: purchaseUnpaid.reduce((s, b) => s + (b.total - b.paidAmount), 0),
      overdueBills: purchaseOverdue,
      paidToday: paidTodayAgg._sum.amount ?? 0,
      recentBills: recentBills.map((b) => ({
        id: b.id, billNumber: b.billNumber, billDate: b.billDate,
        vendorName: b.vendor.name, total: b.total, paidAmount: b.paidAmount, status: b.status,
      })),
    },
    lowStockCount,
  };
}

async function getGstSummary() {
  const invoices = await prisma.invoice.findMany({
    where: { deletedAt: null },
    select: { date: true, subtotal: true, cgst: true, sgst: true, igst: true },
    orderBy: { date: "asc" },
  });

  const byMonth: Record<string, { taxableValue: number; cgst: number; sgst: number; igst: number }> = {};
  for (const inv of invoices) {
    const label = new Date(inv.date).toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (!byMonth[label]) byMonth[label] = { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
    byMonth[label].taxableValue += inv.subtotal;
    byMonth[label].cgst += inv.cgst;
    byMonth[label].sgst += inv.sgst;
    byMonth[label].igst += inv.igst;
  }

  return Object.entries(byMonth).map(([month, data]) => ({ month, ...data }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json({ error: "Query parameter 'type' is required" }, { status: 400 });
    }

    if (type === "summary")            return NextResponse.json(await getReportSummary());
    if (type === "outstanding")        return NextResponse.json(await getReportOutstanding());
    if (type === "stock")              return NextResponse.json(await getReportStock());
    if (type === "sales-dashboard")    return NextResponse.json(await getSalesDashboard());
    if (type === "purchase-dashboard") return NextResponse.json(await getPurchaseDashboard());
    if (type === "combined-dashboard") return NextResponse.json(await getCombinedDashboard());
    if (type === "gst-summary")        return NextResponse.json(await getGstSummary());

    return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
