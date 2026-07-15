import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export async function getBusinessSettings() {
  const settings = await prisma.businessSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  return {
    ...settings,
    gmailAppPassword: settings.gmailAppPassword ? decrypt(settings.gmailAppPassword) : settings.gmailAppPassword,
    bankAccountNumber: settings.bankAccountNumber ? decrypt(settings.bankAccountNumber) : settings.bankAccountNumber,
  };
}

export async function getInvoices(status?: string | null, customerId?: string | null) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  return prisma.invoice.findMany({
    where,
    orderBy: { date: "desc" },
    take: 2000,
    include: {
      customer: { select: { id: true, name: true } },
      // Selected for client-side search-by-product/brand/category on the
      // invoice list page — not displayed as columns there.
      items: {
        select: {
          name: true,
          product: {
            select: {
              name: true,
              brand: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: true } },
      payments: { orderBy: { date: "desc" } },
    },
  });
}

export async function getCustomers() {
  return prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    take: 5000,
    include: { _count: { select: { invoices: true } } },
  });
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

export async function getProducts(search?: string | null) {
  return prisma.product.findMany({
    where: search
      ? { deletedAt: null, OR: [{ name: { contains: search } }, { sku: { contains: search } }] }
      : { deletedAt: null },
    orderBy: { name: "asc" },
    take: 5000,
    include: { category: true, brand: true, _count: { select: { invoiceItems: true } } },
  });
}

export async function getReportSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const invoicesThisMonth = await prisma.invoice.count({
    where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
  });
  const revenueAgg = await prisma.invoice.aggregate({
    where: { deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
    _sum: { total: true },
  });
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ["unpaid", "partial"] } },
    select: { total: true, paidAmount: true },
  });
  const outstandingAmount = unpaidInvoices.reduce(
    (sum, inv) => sum + (inv.total - inv.paidAmount),
    0
  );
  const allTimeAgg = await prisma.invoice.aggregate({
    where: { deletedAt: null },
    _sum: { total: true, paidAmount: true },
  });
  const allProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { stock: true, minStock: true },
  });
  const lowStockCount = allProducts.filter((p) => p.stock <= p.minStock).length;
  const recent = await prisma.invoice.findMany({
    where: { deletedAt: null },
    orderBy: { date: "desc" },
    take: 5,
    include: { customer: { select: { name: true } } },
  });
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
    pendingCount: unpaidInvoices.length,
    lowStockCount,
    recentInvoices,
  };
}

export async function getReportOutstanding(startDate?: string, endDate?: string) {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ["unpaid", "partial"] },
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    },
    orderBy: { date: "asc" },
    include: { customer: { select: { id: true, name: true } } },
  });
  return invoices.map((inv) => ({
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
}

export async function getReportStock() {
  const allProducts = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { stock: "asc" },
    include: { category: true, brand: true },
  });
  return allProducts.filter((p) => p.stock <= p.minStock);
}
