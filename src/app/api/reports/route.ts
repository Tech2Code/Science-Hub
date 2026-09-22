import { NextRequest, NextResponse } from "next/server";
import { getReportSummary, getReportOutstanding, getReportStock } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSectionAccess, requireGstFilingAccess } from "@/lib/apiAuth";
import { parsePageParams } from "@/lib/listQuery";
import { istDayStartUtc, istDayEndUtc, istMonthStartUtc, istNextMonthStartUtc, istTodayStartUtc, istMonthBoundsUtc, toIstDateStr } from "@/lib/validation";
import { getIndianFinancialYear } from "@/lib/documentNumbering";
import { buildGstFilingReport } from "@/lib/gstFiling";
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

// kpiOnly=true skips recentInvoices/topCustomers/monthlyRevenue — every one of those fields is
// period-independent (always "current FY"/"latest 10"/"top 5 all-time"), so the client's period-
// scoped KPI refetch (Sales Overview's `scoped` fetch, alongside its own period-independent `base`
// fetch) only ever reads the KPI fields below and was previously paying for this heavy work twice
// per page load for no reason.
async function getSalesDashboard(period?: PeriodInput, kpiOnly = false) {
  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = resolvePeriod(period, now);
  const todayStart = istTodayStartUtc(now);
  // Date filter reused by both the period-scoped revenue and collected aggregates so all figures share one range.
  const periodDateWhere = periodStart && periodEnd ? { date: { gte: periodStart, lt: periodEnd } } : {};

  const [revenueAgg, collectedAgg, outstandingAgg, overdueCount] = await Promise.all([
    prisma.invoice.aggregate({
      where: { deletedAt: null, ...periodDateWhere },
      // subtotal/cgst/sgst/igst/transportCharge/transportChargeGstAmount summed alongside total
      // (one query, not a second round trip) so the KPI card can show the GST-exclusive taxable
      // value and the GST amount as their own figures, not just the GST-inclusive total.
      _sum: { total: true, subtotal: true, cgst: true, sgst: true, igst: true, transportCharge: true, transportChargeGstAmount: true },
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
  ]);

  const outstandingBalance = outstandingAgg._sum.balanceDue ?? 0;

  let topCustomers: { id: string; name: string; totalBilled: number; totalPaid: number }[] = [];
  let monthlyRevenue: { month: string; total: number }[] = [];
  let fyLabel = "";
  let recentInvoices: { id: string; invoiceNumber: string; date: Date; customerName: string; total: number; paidAmount: number; status: string }[] = [];
  // Everything below is period-independent (always "latest 10"/"top 5 all-time"/"current FY"), so a
  // kpiOnly call (the client's period-scoped KPI refetch) skips it entirely rather than recomputing
  // the exact same values the page's other, period-independent fetch already computed.
  if (!kpiOnly) {
    const [recentInvoicesRaw, topCustomerAggs] = await Promise.all([
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
    recentInvoices = recentInvoicesRaw.map((inv) => ({
      id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
      customerName: inv.customer.name, total: inv.total, paidAmount: inv.paidAmount, status: inv.status,
    }));

    const topCustomerNames = await prisma.customer.findMany({
      where: { id: { in: topCustomerAggs.map((c) => c.customerId) } },
      select: { id: true, name: true },
    });
    const topCustomerNameMap = new Map(topCustomerNames.map((c) => [c.id, c.name]));
    topCustomers = topCustomerAggs.map((c) => ({
      id: c.customerId,
      name: topCustomerNameMap.get(c.customerId) ?? "Unknown",
      totalBilled: c._sum.total ?? 0,
      totalPaid: c._sum.paidAmount ?? 0,
    }));

    // Financial year monthly revenue (Apr–Mar) — IST-aware (see istMonthBoundsUtc), so a document
    // created in the ~5.5-hour IST-vs-server-UTC gap around a month boundary lands in the right bucket.
    const fyYear = getIndianFinancialYear(now);
    fyLabel = `FY ${fyYear}-${String(fyYear + 1).slice(2)}`;
    const fyStart = istMonthBoundsUtc(fyYear, 3).start;
    const fyEnd = istMonthBoundsUtc(fyYear + 1, 3).start;
    // One query for the whole FY, grouped in JS — 12 "parallel" per-month aggregates would still serialize through the pooled connection_limit=1 DB anyway.
    const fyInvoices = await prisma.invoice.findMany({
      where: { deletedAt: null, date: { gte: fyStart, lt: fyEnd } },
      select: { date: true, total: true },
    });
    monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
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
  }

  // Taxable value has no separate bill-level discount to net out (unlike PurchaseBill) — item-level
  // discounts are already baked into `subtotal` at create time. GST = the three tax columns +
  // Transport Charge's own GST (kept in a separate column, so it'd otherwise be silently excluded).
  const revenueTaxable = (revenueAgg._sum.subtotal ?? 0) + (revenueAgg._sum.transportCharge ?? 0);
  const revenueGst = (revenueAgg._sum.cgst ?? 0) + (revenueAgg._sum.sgst ?? 0) + (revenueAgg._sum.igst ?? 0) + (revenueAgg._sum.transportChargeGstAmount ?? 0);

  return {
    periodLabel,
    revenueThisMonth: revenueAgg._sum.total ?? 0,   // now period-scoped (all-time when period="all")
    revenueTaxable,                                  // GST-exclusive portion of revenueThisMonth
    revenueGst,                                      // GST portion of revenueThisMonth
    totalCollected: collectedAgg._sum.amount ?? 0,  // actual payments dated within the period
    outstandingBalance,                              // always as-of-now (current pending balance)
    overdueCount,                                    // always as-of-now
    monthlyRevenue,
    fyLabel,
    recentInvoices,
    topCustomers,
  };
}

// kpiOnly mirrors getSalesDashboard's own flag — see its comment above.
async function getPurchaseDashboard(period?: PeriodInput, kpiOnly = false) {
  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = resolvePeriod(period, now);
  const todayStart = istTodayStartUtc(now);
  // billDate range reused by both the period-scoped spend and paid aggregates so all figures share one range.
  const periodDateWhere = periodStart && periodEnd ? { billDate: { gte: periodStart, lt: periodEnd } } : {};

  const [spendAgg, paidAgg, payableAgg, overdueCount] = await Promise.all([
    prisma.purchaseBill.aggregate({
      where: { deletedAt: null, status: { not: "cancelled" }, ...periodDateWhere },
      // subtotal/discount/taxAmount/transportCharge/transportChargeGstAmount summed alongside total
      // (one query) so the KPI card can show the GST-exclusive taxable value and the GST amount as
      // their own figures, not just the GST-inclusive total.
      _sum: { total: true, subtotal: true, discount: true, taxAmount: true, transportCharge: true, transportChargeGstAmount: true },
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
  ]);

  const payableBalance = payableAgg._sum.balanceDue ?? 0;

  let topVendors: { id: string; name: string; totalBilled: number; totalPaid: number }[] = [];
  let monthlySpend: { month: string; total: number }[] = [];
  let fyLabelP = "";
  let recentBills: { id: string; billNumber: string; billDate: Date; vendorName: string; total: number; paidAmount: number; status: string }[] = [];
  // Everything below is period-independent (always "latest 10"/"top 5 all-time"/"current FY") — see
  // getSalesDashboard's matching comment for why a kpiOnly call skips it entirely.
  if (!kpiOnly) {
    const [recentBillsRaw, topVendorAggs] = await Promise.all([
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
    recentBills = recentBillsRaw.map((b) => ({
      id: b.id, billNumber: b.billNumber, billDate: b.billDate,
      vendorName: b.vendor.name, total: b.total, paidAmount: b.paidAmount, status: b.status,
    }));

    const topVendorNames = await prisma.vendor.findMany({
      where: { id: { in: topVendorAggs.map((v) => v.vendorId) } },
      select: { id: true, name: true },
    });
    const topVendorNameMap = new Map(topVendorNames.map((v) => [v.id, v.name]));
    topVendors = topVendorAggs.map((v) => ({
      id: v.vendorId,
      name: topVendorNameMap.get(v.vendorId) ?? "Unknown",
      totalBilled: v._sum.total ?? 0,
      totalPaid: v._sum.paidAmount ?? 0,
    }));

    // Financial year monthly spend (Apr–Mar) — IST-aware, same reasoning as monthlyRevenue above.
    const fyYearP = getIndianFinancialYear(now);
    fyLabelP = `FY ${fyYearP}-${String(fyYearP + 1).slice(2)}`;
    const fyStartP = istMonthBoundsUtc(fyYearP, 3).start;
    const fyEndP = istMonthBoundsUtc(fyYearP + 1, 3).start;
    // Same fix as monthlyRevenue — one query for the whole FY, grouped in JS.
    const fyBills = await prisma.purchaseBill.findMany({
      where: { deletedAt: null, status: { not: "cancelled" }, billDate: { gte: fyStartP, lt: fyEndP } },
      select: { billDate: true, total: true },
    });
    monthlySpend = Array.from({ length: 12 }, (_, i) => {
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
  }

  // Unlike Invoice, PurchaseBill has its own bill-level `discount` netted out of the taxable value
  // (before GST) — see the create route's `subtotal + taxAmount - discount + transportCharge + ...`
  // total formula. GST = taxAmount + Transport Charge's own GST (a separate column, otherwise
  // silently excluded).
  const spendTaxable = (spendAgg._sum.subtotal ?? 0) - (spendAgg._sum.discount ?? 0) + (spendAgg._sum.transportCharge ?? 0);
  const spendGst = (spendAgg._sum.taxAmount ?? 0) + (spendAgg._sum.transportChargeGstAmount ?? 0);

  return {
    periodLabel,
    spendThisMonth: spendAgg._sum.total ?? 0,     // now period-scoped (all-time when period="all")
    spendTaxable,                                 // GST-exclusive portion of spendThisMonth
    spendGst,                                     // GST portion of spendThisMonth
    totalPaid: paidAgg._sum.amount ?? 0,          // actual payments dated within the period
    payableBalance,                               // always as-of-now
    overdueBillsCount: overdueCount,              // always as-of-now
    monthlySpend,
    fyLabel: fyLabelP,
    recentBills,
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

// Cash Flow — total money billed to customers (Invoice.total, GST-inclusive) vs total money billed
// by vendors (PurchaseBill.total, GST-inclusive) for a financial year, bucketed by IST calendar
// month. Deliberately simple, no matching/netting at all: a bulk purchase of stock that hasn't sold
// yet will show as a big "spend" here with nothing to offset it, which is the correct read for a
// cash-flow view (this is not profit).
// Bucketed by IST calendar month (+330-minute shift before date_trunc, same reasoning as
// getGstSummary) so a document created in the IST-vs-UTC gap around a month boundary lands right.
async function getDashboardFinancials(canSeeSales: boolean, canSeePurchases: boolean, fyStartYear?: number) {
  const now = new Date();
  // Default to the current FY; the dashboard's FY dropdown can request any past FY that has data.
  const fyYear = fyStartYear ?? getIndianFinancialYear(now);
  const fyLabel = FY_LABEL(fyYear);
  const fyStart = istMonthBoundsUtc(fyYear, 3).start;      // Apr 1 (IST) of the FY
  const fyEnd = istMonthBoundsUtc(fyYear + 1, 3).start;    // Apr 1 (IST) of the next FY

  // gstSales/gstPurchases are the GST portion already included within total/spend (not a separate
  // "net GST payable" figure — that already exists, correctly resolvability-filtered, on the GST
  // Filing page; duplicating that computation here would risk the two disagreeing).
  const salesRows = canSeeSales
    ? await prisma.$queryRaw<Array<{ month: Date; gross: number; gst: number }>>`
        SELECT date_trunc('month', "date" + interval '330 minutes') AS month,
               COALESCE(SUM("total"), 0) AS gross,
               COALESCE(SUM("cgst") + SUM("sgst") + SUM("igst") + SUM("transportChargeGstAmount"), 0) AS gst
        FROM "Invoice"
        WHERE "deletedAt" IS NULL
          AND "date" >= ${fyStart} AND "date" < ${fyEnd}
        GROUP BY month
      `
    : [];

  const spendRows = canSeePurchases
    ? await prisma.$queryRaw<Array<{ month: Date; spend: number; gst: number }>>`
        SELECT date_trunc('month', "billDate" + interval '330 minutes') AS month,
               COALESCE(SUM("total"), 0) AS spend,
               COALESCE(SUM("taxAmount") + SUM("transportChargeGstAmount"), 0) AS gst
        FROM "PurchaseBill"
        WHERE "deletedAt" IS NULL AND "status" <> 'cancelled'
          AND "billDate" >= ${fyStart} AND "billDate" < ${fyEnd}
        GROUP BY month
      `
    : [];

  // Key each SQL bucket by its IST year-month so we can line it up against the fixed 12-month grid.
  const keyOf = (d: Date) => new Date(d).toLocaleString("en-IN", { month: "2-digit", year: "numeric", timeZone: "UTC" });
  const salesByMonth = new Map(salesRows.map((r) => [keyOf(r.month), { gross: Number(r.gross) || 0, gst: Number(r.gst) || 0 }]));
  const spendByMonth = new Map(spendRows.map((r) => [keyOf(r.month), { spend: Number(r.spend) || 0, gst: Number(r.gst) || 0 }]));

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const monthIndex0 = (3 + i) % 12;                       // Apr(3) … Mar(2)
    const year = fyYear + Math.floor((3 + i) / 12);
    const { start } = istMonthBoundsUtc(year, monthIndex0);
    const label = start.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const key = start.toLocaleString("en-IN", { month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
    const sales = salesByMonth.get(key);
    const spend = spendByMonth.get(key);
    return {
      month: label,
      totalSales: sales?.gross ?? 0,
      gstSales: sales?.gst ?? 0,
      totalPurchases: spend?.spend ?? 0,
      gstPurchases: spend?.gst ?? 0,
      // Months that haven't happened yet stay at zero but are still returned so the selector shows the full FY.
      future: start > now,
    };
  });

  const total = monthly.reduce(
    (acc, m) => ({
      totalSales: acc.totalSales + m.totalSales,
      gstSales: acc.gstSales + m.gstSales,
      totalPurchases: acc.totalPurchases + m.totalPurchases,
      gstPurchases: acc.gstPurchases + m.gstPurchases,
    }),
    { totalSales: 0, gstSales: 0, totalPurchases: 0, gstPurchases: 0 },
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
  // Invoice.cgst/sgst/igst are item-tax-only by design — a transport charge's own GST lives in the
  // separate transportChargeGstAmount column (see schema notes) and must be folded in here the same
  // way every other sales-GST aggregation in this app already does (getSalesDashboard's revenueGst,
  // getDashboardFinancials' gstSales, buildGstFilingReport's outputTax), or this report silently
  // under-states taxable turnover/output tax vs. GST Filing's Net GST Payable for any period
  // containing a transport-charged invoice. Routed per-row by isInterState, same split the invoice
  // create/edit routes themselves apply (half to CGST/half to SGST intra-state, all to IGST inter-state).
  const rows = await prisma.$queryRaw<Array<{ month: Date; taxableValue: number; cgst: number; sgst: number; igst: number }>>`
    SELECT date_trunc('month', "date" + interval '330 minutes') AS month,
           COALESCE(SUM("subtotal") + SUM("transportCharge"), 0) AS "taxableValue",
           COALESCE(SUM("cgst") + SUM(CASE WHEN "isInterState" THEN 0 ELSE "transportChargeGstAmount" / 2 END), 0) AS cgst,
           COALESCE(SUM("sgst") + SUM(CASE WHEN "isInterState" THEN 0 ELSE "transportChargeGstAmount" / 2 END), 0) AS sgst,
           COALESCE(SUM("igst") + SUM(CASE WHEN "isInterState" THEN "transportChargeGstAmount" ELSE 0 END), 0) AS igst
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
    const kpiOnly = searchParams.get("kpiOnly") === "1";
    if (type === "sales-dashboard")    return NextResponse.json(await getSalesDashboard(parsePeriodParam(searchParams), kpiOnly));
    if (type === "purchase-dashboard") return NextResponse.json(await getPurchaseDashboard(parsePeriodParam(searchParams), kpiOnly));
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
    if (type === "net-gst-payable") {
      // The exact same authoritative figure the GST Filing report shows as "Net GST Payable
      // (Rounded)" — reused via buildGstFilingReport() itself (never a separate reimplementation)
      // so the Dashboard's Cash Flow tile can never drift from what the business actually files.
      // Gated identically to /api/gst-filing (not just sales_overview/purchase_overview, which the
      // rest of the Cash Flow section uses) since this is the real tax-liability number, not a
      // simple total.
      const gate = await requireGstFilingAccess();
      if (!gate.ok) return gate.response;
      const period = parsePeriodParam(searchParams);
      const { start, end } = resolvePeriod(period, new Date());
      if (!start || !end) {
        return NextResponse.json({ error: "A specific financial year or month is required" }, { status: 400 });
      }
      // resolvePeriod()'s `end` is the EXCLUSIVE start of the next period — back up 1ms to land on
      // the period's own last inclusive calendar day before converting to a date-only string.
      const report = await buildGstFilingReport(toIstDateStr(start), toIstDateStr(new Date(end.getTime() - 1)));
      return NextResponse.json({
        netGstPayable: report.summary.netGstPayable,
        rawNetGstPayable: report.summary.rawNetGstPayable,
        netGstPayableRoundOff: report.summary.netGstPayableRoundOff,
      });
    }

    return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
