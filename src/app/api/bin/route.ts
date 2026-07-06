import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { deleteAttachmentBlob } from "@/lib/blobStorage";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Auto-purge items older than 30 days
    // Invoices (cascade handles items/payments)
    const oldInvoices = await prisma.invoice.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    if (oldInvoices.length > 0) {
      await prisma.invoice.deleteMany({ where: { id: { in: oldInvoices.map((i) => i.id) } } });
    }

    // Products
    await prisma.product.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } });

    // Customers
    await prisma.customer.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } });

    // Brands — unassign products first
    const oldBrands = await prisma.brand.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    for (const brand of oldBrands) {
      await prisma.product.updateMany({ where: { brandId: brand.id }, data: { brandId: null } });
    }
    if (oldBrands.length > 0) {
      await prisma.brand.deleteMany({ where: { id: { in: oldBrands.map((b) => b.id) } } });
    }

    // Categories — unassign products first
    const oldCategories = await prisma.category.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    for (const cat of oldCategories) {
      await prisma.product.updateMany({ where: { categoryId: cat.id }, data: { categoryId: null } });
    }
    if (oldCategories.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: oldCategories.map((c) => c.id) } } });
    }

    // Purchase bills (cascade handles items/payments)
    const oldPurchaseBills = await prisma.purchaseBill.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true, attachmentUrl: true },
    });
    if (oldPurchaseBills.length > 0) {
      await prisma.purchaseBill.deleteMany({ where: { id: { in: oldPurchaseBills.map((b) => b.id) } } });
      await Promise.all(oldPurchaseBills.map((b) => deleteAttachmentBlob(b.attachmentUrl)));
    }

    // Vendors — only purge if no purchase bills reference them at all
    const oldVendors = await prisma.vendor.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    for (const vendor of oldVendors) {
      const billCount = await prisma.purchaseBill.count({ where: { vendorId: vendor.id } });
      if (billCount === 0) {
        await prisma.vendor.delete({ where: { id: vendor.id } });
      }
    }

    // Fetch remaining soft-deleted items
    const now = Date.now();

    const [invoices, customers, products, brands, categories, vendors, purchaseBills] = await Promise.all([
      prisma.invoice.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, invoiceNumber: true, deletedAt: true, total: true, customer: { select: { name: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.customer.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, phone: true, city: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.product.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, sku: true, price: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.brand.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.category.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.vendor.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, company: true, phone: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.purchaseBill.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, billNumber: true, deletedAt: true, total: true, vendor: { select: { name: true } } },
        orderBy: { deletedAt: "desc" },
      }),
    ]);

    // Look up who deleted each item from ActivityLog (batch, no schema change needed)
    const allIds = [
      ...invoices.map(i => i.id),
      ...customers.map(c => c.id),
      ...products.map(p => p.id),
      ...brands.map(b => b.id),
      ...categories.map(c => c.id),
      ...vendors.map(v => v.id),
      ...purchaseBills.map(b => b.id),
    ];
    const deleteLogs = await prisma.activityLog.findMany({
      where: { entityId: { in: allIds }, action: { startsWith: "delete_" } },
      select: { entityId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    // Keep only the most recent delete log per entity
    const deletedByMap = new Map<string, string>();
    for (const log of deleteLogs) {
      if (log.entityId && !deletedByMap.has(log.entityId)) {
        deletedByMap.set(log.entityId, log.user.name);
      }
    }

    type BinItem = {
      id: string;
      type: "invoice" | "customer" | "product" | "brand" | "category" | "vendor" | "purchase_bill";
      name: string;
      meta: string;
      deletedAt: string;
      daysLeft: number;
      deletedBy?: string;
    };

    const items: BinItem[] = [
      ...invoices.map((inv) => {
        const daysSince = Math.floor((now - (inv.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: inv.id,
          type: "invoice" as const,
          name: inv.invoiceNumber,
          meta: `${inv.customer.name} • ₹${inv.total.toLocaleString("en-IN")}`,
          deletedAt: (inv.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(inv.id),
        };
      }),
      ...customers.map((c) => {
        const daysSince = Math.floor((now - (c.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          type: "customer" as const,
          name: c.name,
          meta: [c.phone, c.city].filter(Boolean).join(" • "),
          deletedAt: (c.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(c.id),
        };
      }),
      ...products.map((p) => {
        const daysSince = Math.floor((now - (p.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: p.id,
          type: "product" as const,
          name: p.name,
          meta: [p.sku, `₹${p.price.toLocaleString("en-IN")}`].filter(Boolean).join(" • "),
          deletedAt: (p.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(p.id),
        };
      }),
      ...brands.map((b) => {
        const daysSince = Math.floor((now - (b.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: b.id,
          type: "brand" as const,
          name: b.name,
          meta: "",
          deletedAt: (b.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(b.id),
        };
      }),
      ...categories.map((cat) => {
        const daysSince = Math.floor((now - (cat.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: cat.id,
          type: "category" as const,
          name: cat.name,
          meta: "",
          deletedAt: (cat.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(cat.id),
        };
      }),
      ...vendors.map((v) => {
        const daysSince = Math.floor((now - (v.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: v.id,
          type: "vendor" as const,
          name: v.name,
          meta: [v.company, v.phone].filter(Boolean).join(" • "),
          deletedAt: (v.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(v.id),
        };
      }),
      ...purchaseBills.map((b) => {
        const daysSince = Math.floor((now - (b.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: b.id,
          type: "purchase_bill" as const,
          name: b.billNumber,
          meta: `${b.vendor.name} • ₹${b.total.toLocaleString("en-IN")}`,
          deletedAt: (b.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(b.id),
        };
      }),
    ];

    // Sort by deletedAt desc
    items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/bin error:", error);
    return NextResponse.json({ error: "Failed to fetch bin" }, { status: 500 });
  }
}
