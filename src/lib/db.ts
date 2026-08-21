import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeDecrypt } from "@/lib/crypto";

export async function getBusinessSettings() {
  // Hot path (every server-rendered page). Prisma's upsert can still hit a real unique-constraint
  // violation if two inserts race to create the not-yet-committed singleton row — falls back to
  // reading the winner's row instead of 500ing (only reachable before the row first exists).
  let settings;
  try {
    settings = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      settings = await prisma.businessSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    } else {
      throw error;
    }
  }
  const gmailAppPassword = settings.gmailAppPassword ? safeDecrypt(settings.gmailAppPassword) : { value: settings.gmailAppPassword, failed: false };
  const bankAccountNumber = settings.bankAccountNumber ? safeDecrypt(settings.bankAccountNumber) : { value: settings.bankAccountNumber, failed: false };
  return {
    ...settings,
    gmailAppPassword: gmailAppPassword.value,
    // Surfaced instead of silently treating a broken secret (e.g. NEXTAUTH_SECRET mismatch) as "not configured".
    gmailAppPasswordDecryptFailed: gmailAppPassword.failed,
    bankAccountNumber: bankAccountNumber.value,
    bankAccountNumberDecryptFailed: bankAccountNumber.failed,
  };
}

// RootLayout renders on every route including statically-prerendered ones, so a transient DB
// outage here would otherwise fail the whole production build — falls back to fresh-row defaults.
export async function getBrandingOrDefault(): Promise<{ name: string; tagline: string; logoUrl: string }> {
  try {
    const { name, tagline, logoUrl } = await getBusinessSettings();
    return { name, tagline, logoUrl };
  } catch {
    return { name: "Science Hub", tagline: "", logoUrl: "" };
  }
}

export type InvoiceSort = "newest" | "oldest" | "customer_az" | "customer_za" | "amount_high" | "amount_low" | "balance_high";

export interface InvoiceListFilters {
  status?: string | null; // "unpaid" | "partial" | "paid" | "overdue" | null
  customerId?: string | null;
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Matches invoice number, customer name, and item/product/brand/category via nested-relation filter.
function buildInvoiceWhere(filters: InvoiceListFilters): Prisma.InvoiceWhereInput {
  const { status, customerId, search, dateRange } = filters;
  const where: Prisma.InvoiceWhereInput = { deletedAt: null };
  if (status === "overdue") {
    where.status = { not: "paid" };
    where.dueDate = { lt: new Date() };
  } else if (status) {
    where.status = status;
  }
  if (customerId) where.customerId = customerId;
  if (dateRange) where.date = dateRange;
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { items: { some: { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { product: { brand: { name: { contains: q, mode: "insensitive" } } } },
        { product: { category: { name: { contains: q, mode: "insensitive" } } } },
      ] } } },
    ];
  }
  return where;
}

function buildInvoiceOrderBy(sort?: InvoiceSort): Prisma.InvoiceOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":      return [{ createdAt: "asc" }, { id: "asc" }];
    case "customer_az": return [{ customer: { name: "asc" } }, { id: "asc" }];
    case "customer_za": return [{ customer: { name: "desc" } }, { id: "asc" }];
    case "amount_high": return [{ total: "desc" }, { id: "asc" }];
    case "amount_low":  return [{ total: "asc" }, { id: "asc" }];
    case "balance_high": return [{ balanceDue: "desc" }, { id: "asc" }];
    case "newest":
    default:            return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export async function getInvoices(filters: InvoiceListFilters, sort: InvoiceSort | undefined, skip: number, take: number) {
  const where = buildInvoiceWhere(filters);
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: buildInvoiceOrderBy(sort),
      skip,
      take,
      include: { customer: { select: { id: true, name: true, updatedAt: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { data, total };
}

// Stats intentionally ignore `search` so typing in the search box doesn't trigger an extra aggregate query per keystroke.
export async function getInvoiceStats(filters: Omit<InvoiceListFilters, "search">) {
  const where = buildInvoiceWhere(filters);
  // AND'd as a separate nested condition so a status tab's own meaning isn't overwritten by the
  // overdue condition's status constraint (e.g. the "paid" tab always yields 0 overdue).
  const [agg, overdueCount, years] = await Promise.all([
    prisma.invoice.aggregate({ where, _sum: { total: true, paidAmount: true } }),
    prisma.invoice.count({ where: { AND: [where, { status: { not: "paid" }, dueDate: { lt: new Date() } }] } }),
    prisma.$queryRaw<{ year: number }[]>`SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "Invoice" WHERE "deletedAt" IS NULL ORDER BY year DESC`,
  ]);
  const totalInvoiced = agg._sum.total ?? 0;
  const totalPaid = agg._sum.paidAmount ?? 0;
  return {
    totalInvoiced,
    totalPaid,
    totalPending: totalInvoiced - totalPaid,
    overdueCount,
    availableYears: years.map((y) => y.year),
  };
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { id: true, name: true } },
      items: { include: { product: true } },
      payments: { orderBy: { date: "desc" } },
    },
  });
}

export type CustomerSort = "name_az" | "name_za" | "invoices_high" | "invoices_low" | "newest" | "oldest";

function buildCustomerWhere(search?: string | null): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { deletedAt: null };
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { gstin: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function buildCustomerOrderBy(sort?: CustomerSort): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case "name_za":       return [{ name: "desc" }, { id: "asc" }];
    case "invoices_high": return [{ invoices: { _count: "desc" } }, { id: "asc" }];
    case "invoices_low":  return [{ invoices: { _count: "asc" } }, { id: "asc" }];
    case "oldest":        return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":        return [{ createdAt: "desc" }, { id: "asc" }];
    case "name_az":
    default:              return [{ name: "asc" }, { id: "asc" }];
  }
}

export async function getCustomers(search: string | undefined, sort: CustomerSort | undefined, skip: number, take: number) {
  const where = buildCustomerWhere(search);
  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: buildCustomerOrderBy(sort),
      skip,
      take,
      include: { _count: { select: { invoices: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  return { data, total };
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        include: { items: true, payments: true },
        orderBy: { date: "desc" },
      },
    },
  });
}

export type ProductSort = "name_az" | "name_za" | "price_high" | "price_low" | "stock_high" | "stock_low" | "newest" | "oldest";
export type ProductStockFilter = "all" | "low" | "out";

export interface ProductListFilters {
  search?: string | null;
  stockFilter?: ProductStockFilter;
}

function buildProductWhere(filters: ProductListFilters): Prisma.ProductWhereInput {
  const { search, stockFilter } = filters;
  const where: Prisma.ProductWhereInput = { deletedAt: null };
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { brand: { name: { contains: q, mode: "insensitive" } } },
      { category: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (stockFilter === "out") where.stock = { lte: 0 };
  else if (stockFilter === "low") where.isLowStock = true;
  return where;
}

function buildProductOrderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "name_za":    return [{ name: "desc" }, { id: "asc" }];
    case "price_high": return [{ price: "desc" }, { id: "asc" }];
    case "price_low":  return [{ price: "asc" }, { id: "asc" }];
    case "stock_high": return [{ stock: "desc" }, { id: "asc" }];
    case "stock_low":  return [{ stock: "asc" }, { id: "asc" }];
    case "oldest":     return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":     return [{ createdAt: "desc" }, { id: "asc" }];
    case "name_az":
    default:           return [{ name: "asc" }, { id: "asc" }];
  }
}

export async function getProducts(filters: ProductListFilters, sort: ProductSort | undefined, skip: number, take: number) {
  const where = buildProductWhere(filters);
  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: buildProductOrderBy(sort),
      skip,
      take,
      include: { category: true, brand: true, _count: { select: { invoiceItems: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  return { data, total };
}

// Search is excluded — the All/Low/Out tab-count badges are shown simultaneously regardless of the active tab/search text.
export async function getProductStats() {
  const [totalCount, outOfStockCount, lowStockCount] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, stock: { lte: 0 } } }),
    prisma.product.count({ where: { deletedAt: null, isLowStock: true } }),
  ]);
  return { totalCount, outOfStockCount, lowStockCount };
}

export async function getReportSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // These 6 queries are independent — fire together instead of 6 sequential round-trips.
  const [invoicesThisMonth, revenueAgg, unpaidAgg, allTimeAgg, lowStockCount, recent] = await Promise.all([
    prisma.invoice.count({
      where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    }),
    // balanceDue/isLowStock are real Postgres GENERATED columns — sum/count them in the DB rather than reducing/filtering in JS.
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
      _sum: { balanceDue: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null },
      _sum: { total: true, paidAmount: true },
    }),
    prisma.product.count({ where: { deletedAt: null, isLowStock: true } }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
  ]);
  const outstandingAmount = unpaidAgg._sum.balanceDue ?? 0;
  const pendingCount = unpaidAgg._count;
  const recentInvoices = recent.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.date,
    createdAt: inv.createdAt,
    customerName: inv.customer.name,
    total: inv.total,
    paidAmount: inv.paidAmount,
    balance: inv.total - inv.paidAmount,
    status: inv.status,
  }));
  return {
    invoicesThisMonth,
    revenueThisMonth: revenueAgg._sum.total ?? 0,
    outstandingAmount,
    totalRevenue: allTimeAgg._sum.total ?? 0,
    totalCollected: allTimeAgg._sum.paidAmount ?? 0,
    outstandingTotal: outstandingAmount,
    pendingCount,
    lowStockCount,
    recentInvoices,
  };
}

export async function getReportOutstanding(startDate: string | undefined, endDate: string | undefined, skip: number, take: number) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const where = {
    deletedAt: null,
    status: { in: ["unpaid", "partial"] },
    ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
  };

  const [invoices, total, agg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { date: "asc" as const },
      skip,
      take,
      include: { customer: { select: { id: true, name: true } } },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { total: true, paidAmount: true } }),
  ]);

  const data = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.date,
    createdAt: inv.createdAt,
    dueDate: inv.dueDate,
    status: inv.status,
    customer: inv.customer,
    total: inv.total,
    paidAmount: inv.paidAmount,
    balance: inv.total - inv.paidAmount,
  }));

  return { data, total, totalBalance: (agg._sum.total ?? 0) - (agg._sum.paidAmount ?? 0) };
}

export async function getReportStock() {
  // Filter by the generated isLowStock column directly instead of fetching every product and filtering in JS.
  return prisma.product.findMany({
    where: { deletedAt: null, isLowStock: true },
    orderBy: { stock: "asc" },
    include: { category: true, brand: true },
  });
}
