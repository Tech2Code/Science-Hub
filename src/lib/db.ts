import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export const getInvoices = unstable_cache(
  async (status?: string | null, customerId?: string | null) => {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    return prisma.invoice.findMany({
      where,
      orderBy: { date: "desc" },
      include: { customer: { select: { id: true, name: true } } },
    });
  },
  ["invoices"],
  { tags: ["invoices"] }
);

export const getInvoice = unstable_cache(
  async (id: string) => {
    return prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: { orderBy: { date: "desc" } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },
  ["invoice"],
  { tags: ["invoices"] }
);

export const getCustomers = unstable_cache(
  async () => {
    return prisma.customer.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { invoices: true } } },
    });
  },
  ["customers"],
  { tags: ["customers"] }
);

export const getCustomer = unstable_cache(
  async (id: string) => {
    return prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          include: { items: true, payments: true },
          orderBy: { date: "desc" },
        },
      },
    });
  },
  ["customer"],
  { tags: ["customers"] }
);

export const getProducts = unstable_cache(
  async (search?: string | null) => {
    return prisma.product.findMany({
      where: search
        ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] }
        : undefined,
      orderBy: { name: "asc" },
      include: { category: true, brand: true, _count: { select: { invoiceItems: true } } },
    });
  },
  ["products"],
  { tags: ["products"] }
);

export const getReportSummary = unstable_cache(
  async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const invoicesThisMonth = await prisma.invoice.count({
      where: { date: { gte: monthStart, lt: monthEnd } },
    });
    const revenueAgg = await prisma.invoice.aggregate({
      where: { date: { gte: monthStart, lt: monthEnd } },
      _sum: { total: true },
    });
    const unpaidInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial"] } },
      select: { total: true, paidAmount: true },
    });
    const outstandingAmount = unpaidInvoices.reduce(
      (sum, inv) => sum + (inv.total - inv.paidAmount),
      0
    );
    const allProducts = await prisma.product.findMany({
      select: { stock: true, minStock: true },
    });
    const lowStockCount = allProducts.filter((p) => p.stock < p.minStock).length;
    const recent = await prisma.invoice.findMany({
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
      lowStockCount,
      recentInvoices,
    };
  },
  ["report-summary"],
  { tags: ["reports"] }
);

export const getReportOutstanding = unstable_cache(
  async () => {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial"] } },
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
  },
  ["report-outstanding"],
  { tags: ["reports"] }
);

export const getReportStock = unstable_cache(
  async () => {
    const allProducts = await prisma.product.findMany({
      orderBy: { stock: "asc" },
      include: { category: true, brand: true },
    });
    return allProducts.filter((p) => p.stock < p.minStock);
  },
  ["report-stock"],
  { tags: ["reports"] }
);
