import { NextRequest, NextResponse } from "next/server";
import { getReportSummary, getReportOutstanding, getReportStock } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSectionAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { istDayStartUtc, istDayEndUtc, istMonthStartUtc, istNextMonthStartUtc, istTodayStartUtc, istMonthBoundsUtc } from "@/lib/validation";
import { getIndianFinancialYear } from "@/lib/documentNumbering";
import { Prisma } from "@prisma/client";

// A reporting period selected via the two dropdowns (Financial Year + Month):
//   { fyStartYear }              → the whole financial year (Apr fyStartYear → Mar fyStartYear+1)
//   { fyStartYear, month0 }      → a single IST calendar month inside that FY (month0 0-based)
//   "all"                        → no date filter (all time) — still supported for safety
//   "current" / undefined        → the current IST month (default)
type PeriodInput =
  | { fyStartYear: number; month0?: number }
  | "all"
  | "current"
  | undefined;

const FY_LABEL = (startYear: number) => `FY ${startYear}-${String(startYear + 1).slice(2)}`;

// Financial year START year for a given IST month: Jan–Mar (month0 0–2) belong to the PREVIOUS
// April's FY, Apr–Dec (3–11) to the current year's FY.
function fyStartYearOfMonth(year: number, month0: number): number {
  return month0 >= 3 ? year : year - 1;
}

// Parses the period from the query string:
//   ?period=all                    → all time
//   ?fy=2025                       → the whole FY 2025-26
//   ?fy=2025&month=7               → July 2025 (month is 1-based)
//   ?fy=2025&month=1               → January 2026 (Jan belongs to FY 2025-26)
//   (nothing / period=current)     → current IST month
function parsePeriodParam(searchParams: URLSearchParams): PeriodInput {
  const period = searchParams.get("period");
  if (period === "all") return "all";
  const fyStr = searchParams.get("fy");
  if (fyStr) {
    const fyStartYear = Number(fyStr);
    if (Number.isInteger(fyStartYear) && fyStartYear >= 2000 && fyStartYear <= 2100) {
      const monthStr = searchParams.get("month");
      if (monthStr) {
        const month1 = Number(monthStr);
        if (Number.isInteger(month1) && month1 >= 1 && month1 <= 12) {
          return { fyStartYear, month0: month1 - 1 };
        }
      }
      return { fyStartYear };
    }
  }
  return "current";
}

function resolvePeriod(period: PeriodInput, now: Date): { start?: Date; end?: Date; label: string } {
  if (period === "all") return { start: undefined, end: undefined, label: "All time" };
  if (period && typeof period === "object") {
    // A specific month within the chosen FY.
    if (period.month0 !== undefined) {
      // month0 0–2 (Jan–Mar) fall in the SECOND calendar year of the FY; 3–11 in the first.
      const calYear = period.month0 >= 3 ? period.fyStartYear : period.fyStartYear + 1;
      const { start, end } = istMonthBoundsUtc(calYear, period.month0);
      const label = start.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
      return { start, end, label };
    }
    // The whole FY: Apr fyStartYear → Apr (fyStartYear+1).
    const start = istMonthBoundsUtc(period.fyStartYear, 3).start;
    const end = istMonthBoundsUtc(period.fyStartYear + 1, 3).start;
    return { start, end, label: FY_LABEL(period.fyStartYear) };
  }
  const start = istMonthStartUtc(now);
  const end = istNextMonthStartUtc(now);
  return { start, end, label: start.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) };
}

// The financial years (start years) that actually have sales/purchase data, newest first, always
// including the current FY even if empty — powers the FY dropdown.
async function getAvailableFinancialYears(): Promise<{ years: { startYear: number; label: string }[] }> {
  const [firstInvoice, firstBill] = await Promise.all([
    prisma.invoice.findFirst({ where: { deletedAt: null }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.purchaseBill.findFirst({ where: { deletedAt: null }, orderBy: { billDate: "asc" }, select: { billDate: true } }),
  ]);
  const now = new Date();
  const currentFy = getIndianFinancialYear(now);
  const candidates = [firstInvoice?.date, firstBill?.billDate].filter((d): d is Date => !!d);
  const earliestFy = candidates.length ? Math.min(...candidates.map((d) => getIndianFinancialYear(d))) : currentFy;
  const years: { startYear: number; label: string }[] = [];
  for (let y = currentFy; y >= earliestFy; y--) years.push({ startYear: y, label: FY_LABEL(y) });
  return { years };
}

async function getSalesDashboard(period?: PeriodInput) {
  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = resolvePeriod(period, now);
  const todayStart = istTodayStartUtc(now);
  // Date filter reused by both the period-scoped revenue and collected aggregates so all figures share one range.
  const periodDateWhere = periodStart && periodEnd ? { date: { gte: periodStart, lt: periodEnd } } : {};

  const [revenueAgg, collectedAgg, outstandingAgg, overdueCount, recentInvoices, topCustomerAggs] = await Promise.all([
    prisma.invoice.aggregate({
      where: { deletedAt: null, ...periodDateWhere },
      _sum: { total: true },
    }),
    // Collected in-period = actual Payment rows dated within the period (not the parent invoice's
    // cumulative paidAmount filtered by the invoice's own date — a payment can land in a different
    // month than the invoice it settles). Scoped to the same period bound as revenueAgg via the
    // payment's own date.
    prisma.payment.aggregate({
      where: { invoice: { deletedAt: null }, ...(periodStart && periodEnd ? { date: { gte: periodStart, lt: periodEnd } } : {}) },
      _sum: { amount: true },
    }),
    // Outstanding = current pending balance of invoices dated within the period (all invoices when
    // "all time"). It's the *current* balanceDue of those invoices, not a historical as-of-month
    // snapshot. balanceDue is a real Postgres GENERATED column — summed DB-side, not reduced in JS.
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, ...periodDateWhere },
      _sum: { balanceDue: true },
    }),
    // Overdue = invoices dated within the period whose due date has now passed and are still unpaid/partial.
    prisma.invoice.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, ...periodDateWhere },
    }),
    // createdAt, not date — matches invoiceNumber's creation-order sequence and stays immune to a
    // later backdate (see buildInvoiceOrderBy()'s comment in db.ts for the full reasoning).
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
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

  // Financial year monthly revenue (Apr–Mar) — IST-aware (see istMonthBoundsUtc), so a document
  // created in the ~5.5-hour IST-vs-server-UTC gap around a month boundary lands in the right bucket.
  const fyYear = getIndianFinancialYear(now);
  const fyLabel = `FY ${fyYear}-${String(fyYear + 1).slice(2)}`;
  const fyStart = istMonthBoundsUtc(fyYear, 3).start;
  const fyEnd = istMonthBoundsUtc(fyYear + 1, 3).start;
  // One query for the whole FY, grouped in JS — 12 "parallel" per-month aggregates would still serialize through the pooled connection_limit=1 DB anyway.
  const fyInvoices = await prisma.invoice.findMany({
    where: { deletedAt: null, date: { gte: fyStart, lt: fyEnd } },
    select: { date: true, total: true },
  });
  const monthlyRevenue: { month: string; total: number }[] = Array.from({ length: 12 }, (_, i) => {
    const monthIndex0 = (3 + i) % 12;
    const year = fyYear + Math.floor((3 + i) / 12);
    const { start: d, end } = istMonthBoundsUtc(year, monthIndex0);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    if (d > now) return { month: label, total: 0 };
    const total = fyInvoices
      .filter((inv) => inv.date >= d && inv.date < end)
      .reduce((sum, inv) => sum + inv.total, 0);
    return { month: label, total };
  });

  return {
    periodLabel,
    revenueThisMonth: revenueAgg._sum.total ?? 0,   // now period-scoped (all-time when period="all")
    totalCollected: collectedAgg._sum.amount ?? 0,  // actual payments dated within the period
    outstandingBalance,                              // always as-of-now (current pending balance)
    overdueCount,                                    // always as-of-now
    monthlyRevenue,
    fyLabel,
    recentInvoices: recentInvoices.map((inv) => ({
      id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
      customerName: inv.customer.name, total: inv.total, paidAmount: inv.paidAmount, status: inv.status,
    })),
    topCustomers,
  };
}

async function getPurchaseDashboard(period?: PeriodInput) {
  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = resolvePeriod(period, now);
  const todayStart = istTodayStartUtc(now);
  // billDate range reused by both the period-scoped spend and paid aggregates so all figures share one range.
  const periodDateWhere = periodStart && periodEnd ? { billDate: { gte: periodStart, lt: periodEnd } } : {};

  const [spendAgg, paidAgg, payableAgg, overdueCount, recentBills, topVendorAggs] = await Promise.all([
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { not: "cancelled" }, ...periodDateWhere },
      _sum: { total: true },
    }),
    // Paid in-period = actual PurchasePayment rows dated within the period (not the parent bill's
    // cumulative paidAmount filtered by the bill's own billDate) — same fix as sales' collectedAgg.
    prisma.purchasePayment.aggregate({
      where: {
        purchaseBill: { deletedAt: null, status: { not: "cancelled" } },
        ...(periodStart && periodEnd ? { date: { gte: periodStart, lt: periodEnd } } : {}),
      },
      _sum: { amount: true },
    }),
    // Payable = current pending balance of bills dated within the period (all bills when "all time").
    // Current balanceDue of those bills, not a historical as-of-month snapshot. DB-side sum of the generated column.
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, ...periodDateWhere },
      _sum: { balanceDue: true },
    }),
    // Overdue = bills dated within the period whose due date has now passed and are still unpaid/partial.
    prisma.purchaseBill.count({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] }, dueDate: { lt: todayStart }, ...periodDateWhere },
    }),
    // createdAt, not billDate — matches billNumber's creation-order sequence and stays immune to a
    // later backdate (see buildBillOrderBy()'s comment in purchaseBillQuery.ts for the full reasoning).
    prisma.purchaseBill.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
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

  // Financial year monthly spend (Apr–Mar) — IST-aware, same reasoning as monthlyRevenue above.
  const fyYearP = getIndianFinancialYear(now);
  const fyLabelP = `FY ${fyYearP}-${String(fyYearP + 1).slice(2)}`;
  const fyStartP = istMonthBoundsUtc(fyYearP, 3).start;
  const fyEndP = istMonthBoundsUtc(fyYearP + 1, 3).start;
  // Same fix as monthlyRevenue — one query for the whole FY, grouped in JS.
  const fyBills = await prisma.purchaseBill.findMany({
    where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: fyStartP, lt: fyEndP } },
    select: { billDate: true, total: true },
  });
  const monthlySpend: { month: string; total: number }[] = Array.from({ length: 12 }, (_, i) => {
    const monthIndex0 = (3 + i) % 12;
    const year = fyYearP + Math.floor((3 + i) / 12);
    const { start: d, end } = istMonthBoundsUtc(year, monthIndex0);
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    if (d > now) return { month: label, total: 0 };
    const total = fyBills
      .filter((b) => b.billDate >= d && b.billDate < end)
      .reduce((sum, b) => sum + b.total, 0);
    return { month: label, total };
  });

  return {
    periodLabel,
    spendThisMonth: spendAgg._sum.total ?? 0,     // now period-scoped (all-time when period="all")
    totalPaid: paidAgg._sum.amount ?? 0,          // actual payments dated within the period
    payableBalance,                               // always as-of-now
    overdueBillsCount: overdueCount,              // always as-of-now
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
  const monthStart = istMonthStartUtc(now);
  const monthEnd = istNextMonthStartUtc(now);
  const todayStart = istTodayStartUtc(now);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [
    salesMonthAgg, salesOutstandingAgg, salesOverdue, collectedTodayAgg,
    spendMonthAgg, purchaseUnpaidAgg, purchaseOverdue, paidTodayAgg,
    recentInvoices, recentBills, lowStockCount, outOfStockCount,
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
    // Both createdAt, not date/billDate — matches each document's numbering sequence, immune to a later backdate.
    prisma.invoice.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { customer: { select: { name: true } } } }),
    prisma.purchaseBill.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, include: { vendor: { select: { name: true } } } }),
    // isLowStock is also a real Postgres GENERATED column — a plain count against it instead of fetching every product to filter in JS.
    prisma.product.count({ where: { deletedAt: null, isLowStock: true } }),
    // Mirrors isOutOfStock() in stockStatus.ts (stock <= 0) — there's no generated column for this one, so filter directly.
    prisma.product.count({ where: { deletedAt: null, stock: { lte: 0 } } }),
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
    outOfStockCount,
  };
}

// Financial-year figures for TWO separate, deliberately-not-mixed dashboard sections:
//
//   1. ACTUAL PROFIT — real gross profit, fully netted:
//        Net Sales (ex-GST)  =  Gross Sales (incl. transport) − GST
//        − Sales Returns     =  credit notes' own (ex-GST) value, so a returned sale isn't counted as revenue
//        − Net COGS          =  SUM(sold qty × InvoiceItem.costPrice) − SUM(returned qty × ReturnItem.costPrice)
//        = Gross Profit
//      costPrice/ReturnItem.costPrice are maintained by src/lib/inventoryCosting.ts's weighted-
//      average-cost (WAC) replay, triggered on every stock-affecting mutation — never derived here.
//
//   2. CASH FLOW — deliberately simple, no matching/netting at all: total money billed to
//      customers (Invoice.total, GST-inclusive) vs total money billed by vendors (PurchaseBill.total,
//      GST-inclusive) for the period. This is NOT profit — a bulk purchase of stock that hasn't sold
//      yet will show as a big "spend" here with nothing to offset it, which is the correct read for
//      a cash-flow view but would be a wrong read for profit (that's what section 1 is for).
//
// Both bucketed by IST calendar month (+330-minute shift before date_trunc, same reasoning as
// getGstSummary) so a document created in the IST-vs-UTC gap around a month boundary lands right.
async function getDashboardFinancials(canSeeSales: boolean, canSeePurchases: boolean, fyStartYear?: number) {
  const now = new Date();
  // Default to the current FY; the dashboard's FY dropdown can request any past FY that has data.
  const fyYear = fyStartYear ?? getIndianFinancialYear(now);
  const fyLabel = FY_LABEL(fyYear);
  const fyStart = istMonthBoundsUtc(fyYear, 3).start;      // Apr 1 (IST) of the FY
  const fyEnd = istMonthBoundsUtc(fyYear + 1, 3).start;    // Apr 1 (IST) of the next FY

  // Sales side, bucketed by IST month. costedQty = costSource 'ledger' (real WAC), estimatedQty =
  // costSource 'fallback' (Product.purchasePrice placeholder — sold before any qualifying purchase
  // existed; auto-upgrades to 'ledger' the moment a qualifying purchase is recorded), uncostedQty =
  // costPrice still NULL (a legacy row from before this column existed, never recomputed since).
  const salesRows = canSeeSales
    ? await prisma.$queryRaw<Array<{ month: Date; itemGross: number; itemGst: number; cogs: number; costedQty: number; estimatedQty: number; uncostedQty: number }>>`
        SELECT date_trunc('month', i."date" + interval '330 minutes') AS month,
               COALESCE(SUM(ii."total"), 0) AS "itemGross",
               COALESCE(SUM(ii."gstAmount"), 0) AS "itemGst",
               COALESCE(SUM(COALESCE(ii."costPrice", 0) * ii."quantity"), 0) AS cogs,
               COALESCE(SUM(CASE WHEN ii."costSource" = 'ledger' THEN ii."quantity" ELSE 0 END), 0) AS "costedQty",
               COALESCE(SUM(CASE WHEN ii."costSource" = 'fallback' THEN ii."quantity" ELSE 0 END), 0) AS "estimatedQty",
               COALESCE(SUM(CASE WHEN ii."costPrice" IS NULL AND ii."productId" IS NOT NULL THEN ii."quantity" ELSE 0 END), 0) AS "uncostedQty"
        FROM "Invoice" i
        JOIN "InvoiceItem" ii ON ii."invoiceId" = i."id"
        WHERE i."deletedAt" IS NULL
          AND i."date" >= ${fyStart} AND i."date" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Transport/freight charged to the customer is a separate INVOICE-level line (its own charge +
  // GST), so it must be summed per-invoice — NOT inside the item JOIN above, where it'd be counted
  // once per line and inflated on multi-item invoices. It's real sale revenue with no product cost,
  // so its net (charge, ex-GST) flows straight into net sales AND gross profit, and its GST into
  // GST collected. Grouped by the same IST month bucket.
  // roundOff is summed here too (invoice-grouped, no item JOIN) rather than in salesRows above —
  // it's a per-INVOICE column, and summing it through the item JOIN would multiply it once per line
  // on any multi-item invoice. Without it, grossSales silently drops each invoice's own commercial
  // rounding adjustment (up to ~±₹0.5 each, see computeRoundOff) and never quite matches the invoice's
  // own stored `total` — the exact discrepancy this section's "total billed, nothing netted out" claim
  // (and the Sales Overview's Revenue figure, which sums `total` directly) promises not to have.
  const transportRows = canSeeSales
    ? await prisma.$queryRaw<Array<{ month: Date; transport: number; transportGst: number; roundOff: number }>>`
        SELECT date_trunc('month', "date" + interval '330 minutes') AS month,
               COALESCE(SUM("transportCharge"), 0) AS transport,
               COALESCE(SUM("transportChargeGstAmount"), 0) AS "transportGst",
               COALESCE(SUM("roundOff"), 0) AS "roundOff"
        FROM "Invoice"
        WHERE "deletedAt" IS NULL
          AND "date" >= ${fyStart} AND "date" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Sales Returns (credit notes) — bucketed by the RETURN's own date, not the original invoice's,
  // since that's the month the revenue/COGS actually reverses in. Netted out of both revenue (its
  // own ex-GST value) and COGS (the returned qty's cost, captured on ReturnItem.costPrice) so a
  // returned sale isn't counted as either profit or loss.
  const returnRows = canSeeSales
    ? await prisma.$queryRaw<Array<{ month: Date; returnGross: number; returnGst: number; returnCogs: number }>>`
        SELECT date_trunc('month', r."date" + interval '330 minutes') AS month,
               COALESCE(SUM(ri."total"), 0) AS "returnGross",
               COALESCE(SUM(ri."gstAmount"), 0) AS "returnGst",
               COALESCE(SUM(COALESCE(ri."costPrice", 0) * ri."quantity"), 0) AS "returnCogs"
        FROM "Return" r
        JOIN "ReturnItem" ri ON ri."returnId" = r."id"
        WHERE r."deletedAt" IS NULL
          AND r."date" >= ${fyStart} AND r."date" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Return.roundOff is a per-RETURN column (same shape as Invoice.roundOff above) — summed
  // separately, ungrouped by item, for the same reason: through the ReturnItem JOIN above it would
  // multiply once per line on any multi-item credit note.
  const returnRoundOffRows = canSeeSales
    ? await prisma.$queryRaw<Array<{ month: Date; roundOff: number }>>`
        SELECT date_trunc('month', "date" + interval '330 minutes') AS month,
               COALESCE(SUM("roundOff"), 0) AS "roundOff"
        FROM "Return"
        WHERE "deletedAt" IS NULL
          AND "date" >= ${fyStart} AND "date" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Total purchase spend (GST-inclusive bill totals) — the Cash Flow section's "money paid out"
  // side. Deliberately NOT netted against COGS/profit — see the function-level comment above.
  const spendRows = canSeePurchases
    ? await prisma.$queryRaw<Array<{ month: Date; spend: number }>>`
        SELECT date_trunc('month', "billDate" + interval '330 minutes') AS month,
               COALESCE(SUM("total"), 0) AS spend
        FROM "PurchaseBill"
        WHERE "deletedAt" IS NULL AND "status" <> 'cancelled'
          AND "billDate" >= ${fyStart} AND "billDate" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Key each SQL bucket by its IST year-month so we can line it up against the fixed 12-month grid.
  const keyOf = (d: Date) => new Date(d).toLocaleString("en-IN", { month: "2-digit", year: "numeric", timeZone: "UTC" });
  const salesByMonth = new Map(salesRows.map((r) => [keyOf(r.month), r]));
  const transportByMonth = new Map(transportRows.map((r) => [keyOf(r.month), r]));
  const returnByMonth = new Map(returnRows.map((r) => [keyOf(r.month), r]));
  const returnRoundOffByMonth = new Map(returnRoundOffRows.map((r) => [keyOf(r.month), Number(r.roundOff) || 0]));
  const spendByMonth = new Map(spendRows.map((r) => [keyOf(r.month), Number(r.spend) || 0]));

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const monthIndex0 = (3 + i) % 12;                       // Apr(3) … Mar(2)
    const year = fyYear + Math.floor((3 + i) / 12);
    const { start } = istMonthBoundsUtc(year, monthIndex0);
    const label = start.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const key = start.toLocaleString("en-IN", { month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
    const s = salesByMonth.get(key);
    const t = transportByMonth.get(key);
    const r = returnByMonth.get(key);
    const transport = Number(t?.transport) || 0;            // freight charged, ex-GST
    const transportGst = Number(t?.transportGst) || 0;      // GST on that freight
    const invoiceRoundOff = Number(t?.roundOff) || 0;       // each invoice's own commercial-rounding adjustment
    // Gross Sales incl GST = item lines (incl their GST) + transport charge + its GST + each
    // invoice's own roundOff — without it this silently drifted from the invoice's own stored total
    // (and from Sales Overview's Revenue figure, which sums `total` directly) by up to ~₹0.5/invoice.
    const grossSales = (Number(s?.itemGross) || 0) + transport + transportGst + invoiceRoundOff;
    const gst = (Number(s?.itemGst) || 0) + transportGst;
    const netSales = grossSales - gst;                      // = item taxable + transport (ex-GST) + roundOff
    const cogs = Number(s?.cogs) || 0;                      // transport has no product cost

    const returnGross = Number(r?.returnGross) || 0;
    const returnGst = Number(r?.returnGst) || 0;
    const returnRoundOff = returnRoundOffByMonth.get(key) ?? 0;
    const returnNet = returnGross - returnGst + returnRoundOff; // credit note's own ex-GST value, incl. its own roundOff
    const returnCogs = Number(r?.returnCogs) || 0;

    const netSalesAfterReturns = netSales - returnNet;
    const netCogs = cogs - returnCogs;

    return {
      month: label,
      // Actual Profit section
      grossSales,
      gst,
      netSales,
      returnNet,
      netSalesAfterReturns,
      cogs,
      returnCogs,
      netCogs,
      grossProfit: netSalesAfterReturns - netCogs,
      costedQty: Number(s?.costedQty) || 0,
      estimatedQty: Number(s?.estimatedQty) || 0,
      uncostedQty: Number(s?.uncostedQty) || 0,
      // Cash Flow section — simple totals, no netting against each other.
      totalSales: grossSales,
      totalPurchases: spendByMonth.get(key) ?? 0,
      // Months that haven't happened yet stay at zero but are still returned so the selector shows the full FY.
      future: start > now,
    };
  });

  const total = monthly.reduce(
    (acc, m) => ({
      grossSales: acc.grossSales + m.grossSales,
      gst: acc.gst + m.gst,
      netSales: acc.netSales + m.netSales,
      returnNet: acc.returnNet + m.returnNet,
      netSalesAfterReturns: acc.netSalesAfterReturns + m.netSalesAfterReturns,
      cogs: acc.cogs + m.cogs,
      returnCogs: acc.returnCogs + m.returnCogs,
      netCogs: acc.netCogs + m.netCogs,
      grossProfit: acc.grossProfit + m.grossProfit,
      costedQty: acc.costedQty + m.costedQty,
      estimatedQty: acc.estimatedQty + m.estimatedQty,
      uncostedQty: acc.uncostedQty + m.uncostedQty,
      totalSales: acc.totalSales + m.totalSales,
      totalPurchases: acc.totalPurchases + m.totalPurchases,
    }),
    { grossSales: 0, gst: 0, netSales: 0, returnNet: 0, netSalesAfterReturns: 0, cogs: 0, returnCogs: 0, netCogs: 0, grossProfit: 0, costedQty: 0, estimatedQty: 0, uncostedQty: 0, totalSales: 0, totalPurchases: 0 },
  );

  return {
    fyLabel,
    canSeeSales,
    canSeePurchases,
    total,     // "all over the year" figures
    monthly,   // per-month figures the client's month selector drills into
  };
}

async function getGstSummary(startDate?: string, endDate?: string) {
  // Stays scoped to "all invoices" when no range is picked (matches the Sales Reports page's own
  // label) — the aggregation itself is pushed into Postgres via date_trunc/groupBy so this never
  // has to load every invoice row into Node to bucket by month, regardless of table size.
  const gte = startDate ? istDayStartUtc(startDate) : undefined;
  const lte = endDate ? istDayEndUtc(endDate) : undefined;

  // "date" is stored as a naive UTC instant (Prisma's default DateTime mapping, no column-level
  // timezone) — bucketing with a bare date_trunc('month', "date") groups by UTC month, which
  // silently reassigns anything created IST 00:00-05:29 to the previous month's bucket. Shift by
  // the IST offset before truncating so the grouping matches the IST calendar month instead.
  const rows = await prisma.$queryRaw<Array<{ month: Date; taxableValue: number; cgst: number; sgst: number; igst: number }>>`
    SELECT date_trunc('month', "date" + interval '330 minutes') AS month,
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

  // r.month already carries the IST-shifted instant used for grouping, so format it as UTC fields
  // (not the server's local timezone) to read back the correct IST month/year label.
  return rows.map((r) => ({
    month: new Date(r.month).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
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
    if (type === "financial-years")    return NextResponse.json(await getAvailableFinancialYears());
    if (type === "sales-dashboard")    return NextResponse.json(await getSalesDashboard(parsePeriodParam(searchParams)));
    if (type === "purchase-dashboard") return NextResponse.json(await getPurchaseDashboard(parsePeriodParam(searchParams)));
    if (type === "combined-dashboard") {
      const role = auth.session.user.role;
      const sections = Array.isArray(auth.session.user.sections) ? auth.session.user.sections : [];
      const canSeeSales = role === "admin" || sections.includes("sales_overview");
      const canSeePurchases = role === "admin" || sections.includes("purchase_overview");
      // The dashboard's FY dropdown sends ?fy=YYYY to view a past financial year's Financial Summary.
      const fyParam = parsePeriodParam(searchParams);
      const fyStartYear = fyParam && typeof fyParam === "object" ? fyParam.fyStartYear : undefined;
      const [combined, financials] = await Promise.all([
        getCombinedDashboard(canSeeSales, canSeePurchases),
        getDashboardFinancials(canSeeSales, canSeePurchases, fyStartYear),
      ]);
      return NextResponse.json({ ...combined, financials });
    }
    if (type === "gst-summary")        return NextResponse.json(await getGstSummary(startDate, endDate));

    return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
