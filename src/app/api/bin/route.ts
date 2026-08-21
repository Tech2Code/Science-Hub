import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/apiAuth";

export async function GET() {
  try {
    // Managers have no bin access — requireWriteAccess blocks them.
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Invoices/purchase bills/credit notes are exempt from auto-purge — their numbers are legally significant GST sequences; purge only via explicit admin action.

    // Products — only purge if not referenced by invoice/purchase items (an unguarded deleteMany would throw on the FK constraint).
    const oldProducts = await prisma.product.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    if (oldProducts.length > 0) {
      const oldProductIds = oldProducts.map((p) => p.id);
      // Batched groupBy (2 queries total) instead of a per-product COUNT round-trip to avoid N+1.
      const [referencedByInvoiceItems, referencedByPurchaseItems] = await Promise.all([
        prisma.invoiceItem.groupBy({ by: ["productId"], where: { productId: { in: oldProductIds } } }),
        prisma.purchaseBillItem.groupBy({ by: ["productId"], where: { productId: { in: oldProductIds } } }),
      ]);
      const blockedProductIds = new Set([
        ...referencedByInvoiceItems.map((r) => r.productId),
        ...referencedByPurchaseItems.map((r) => r.productId).filter((id): id is string => id !== null),
      ]);
      const deletableProductIds = oldProductIds.filter((id) => !blockedProductIds.has(id));
      if (deletableProductIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: deletableProductIds } } });
      }
    }

    // Customers — only purge if no invoices reference them at all
    const oldCustomers = await prisma.customer.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    if (oldCustomers.length > 0) {
      const oldCustomerIds = oldCustomers.map((c) => c.id);
      const referencedByInvoices = await prisma.invoice.groupBy({
        by: ["customerId"],
        where: { customerId: { in: oldCustomerIds } },
      });
      const blockedCustomerIds = new Set(referencedByInvoices.map((r) => r.customerId));
      const deletableCustomerIds = oldCustomerIds.filter((id) => !blockedCustomerIds.has(id));
      if (deletableCustomerIds.length > 0) {
        await prisma.customer.deleteMany({ where: { id: { in: deletableCustomerIds } } });
      }
    }

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

    // Vendors — only purge if no purchase bills reference them at all
    const oldVendors = await prisma.vendor.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    if (oldVendors.length > 0) {
      const oldVendorIds = oldVendors.map((v) => v.id);
      const referencedByBills = await prisma.purchaseBill.groupBy({
        by: ["vendorId"],
        where: { vendorId: { in: oldVendorIds } },
      });
      const blockedVendorIds = new Set(referencedByBills.map((r) => r.vendorId));
      const deletableVendorIds = oldVendorIds.filter((id) => !blockedVendorIds.has(id));
      if (deletableVendorIds.length > 0) {
        await prisma.vendor.deleteMany({ where: { id: { in: deletableVendorIds } } });
      }
    }

    // Rate lists aren't GST-numbered, so they follow the standard 30-day auto-purge; nothing references a RateList so no FK check is needed.
    const oldRateLists = await prisma.rateList.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });
    if (oldRateLists.length > 0) {
      await prisma.rateList.deleteMany({ where: { id: { in: oldRateLists.map((r) => r.id) } } });
    }

    const purged = oldProducts.length + oldCustomers.length + oldBrands.length
      + oldCategories.length + oldVendors.length + oldRateLists.length;
    if (purged > 0) {
      revalidateTag("customers", { expire: 0 });
      revalidateTag("products", { expire: 0 });
      revalidateTag("vendors", { expire: 0 });
      revalidateTag("rate-lists", { expire: 0 });
      revalidateTag("reports", { expire: 0 });
    }

    // Fetch remaining soft-deleted items
    const now = Date.now();

    // One-off customers/vendors are soft-deleted at creation with no delete_* log entry — exclude them here since the user never asked to delete them.
    const [explicitlyDeletedCustomers, explicitlyDeletedVendors] = await Promise.all([
      prisma.activityLog.findMany({ where: { entityType: "customer", action: "delete_customer" }, select: { entityId: true } }),
      prisma.activityLog.findMany({ where: { entityType: "vendor", action: "delete_vendor" }, select: { entityId: true } }),
    ]);
    const explicitlyDeletedCustomerIds = [...new Set(explicitlyDeletedCustomers.map((l) => l.entityId).filter((id): id is string => !!id))];
    const explicitlyDeletedVendorIds = [...new Set(explicitlyDeletedVendors.map((l) => l.entityId).filter((id): id is string => !!id))];

    const [invoices, customers, products, brands, categories, vendors, purchaseBills, returns, rateLists] = await Promise.all([
      prisma.invoice.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, invoiceNumber: true, deletedAt: true, total: true, customer: { select: { name: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.customer.findMany({
        where: { deletedAt: { not: null }, id: { in: explicitlyDeletedCustomerIds } },
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
        where: { deletedAt: { not: null }, id: { in: explicitlyDeletedVendorIds } },
        select: { id: true, name: true, company: true, phone: true, deletedAt: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.purchaseBill.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, billNumber: true, deletedAt: true, total: true, vendor: { select: { name: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.return.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true, creditNoteNumber: true, deletedAt: true, total: true,
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.rateList.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, title: true, deletedAt: true, _count: { select: { items: true } } },
        orderBy: { deletedAt: "desc" },
      }),
    ]);

    // Determine FK-protection reasons for the UI upfront, batched via groupBy per entity type rather than a per-row count query.
    const customerIds = customers.map((c) => c.id);
    const productIds = products.map((p) => p.id);
    const vendorIds = vendors.map((v) => v.id);
    const [
      customerInvoiceCounts, productInvoiceItemCounts, productPurchaseItemCounts, vendorBillCounts,
    ] = await Promise.all([
      customerIds.length
        ? prisma.invoice.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds } }, _count: { _all: true } })
        : [],
      productIds.length
        ? prisma.invoiceItem.groupBy({ by: ["productId"], where: { productId: { in: productIds } }, _count: { _all: true } })
        : [],
      productIds.length
        ? prisma.purchaseBillItem.groupBy({ by: ["productId"], where: { productId: { in: productIds } }, _count: { _all: true } })
        : [],
      vendorIds.length
        ? prisma.purchaseBill.groupBy({ by: ["vendorId"], where: { vendorId: { in: vendorIds } }, _count: { _all: true } })
        : [],
    ]);
    const customerBlockMap = new Map(
      customerInvoiceCounts.map((r) => [r.customerId, `Has ${r._count._all} invoice(s) on record (including any in the bin)`])
    );
    const productInvoiceItemCountMap = new Map(productInvoiceItemCounts.map((r) => [r.productId, r._count._all]));
    const productPurchaseItemCountMap = new Map(
      productPurchaseItemCounts.filter((r) => r.productId !== null).map((r) => [r.productId as string, r._count._all])
    );
    const productBlockMap = new Map(
      productIds.map((id) => {
        const itemCount = productInvoiceItemCountMap.get(id) ?? 0;
        const purchaseItemCount = productPurchaseItemCountMap.get(id) ?? 0;
        let reason: string | undefined;
        if (itemCount > 0) reason = `Used in ${itemCount} invoice line item(s) (including any in the bin)`;
        else if (purchaseItemCount > 0) reason = `Used in ${purchaseItemCount} purchase bill line item(s) (including any in the bin)`;
        return [id, reason] as const;
      })
    );
    const vendorBlockMap = new Map(
      vendorBillCounts.map((r) => [r.vendorId, `Has ${r._count._all} purchase bill(s) on record (including any in the bin)`])
    );

    // Look up who deleted each item from ActivityLog (batch, no schema change needed)
    const allIds = [
      ...invoices.map(i => i.id),
      ...customers.map(c => c.id),
      ...products.map(p => p.id),
      ...brands.map(b => b.id),
      ...categories.map(c => c.id),
      ...vendors.map(v => v.id),
      ...purchaseBills.map(b => b.id),
      ...returns.map(r => r.id),
      ...rateLists.map(r => r.id),
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
      type: "invoice" | "customer" | "product" | "brand" | "category" | "vendor" | "purchase_bill" | "return" | "rate_list";
      name: string;
      meta: string;
      deletedAt: string;
      daysLeft: number;
      deletedBy?: string;
      protectedReason?: string;
    };

    const items: BinItem[] = [
      ...invoices.map((inv) => ({
        id: inv.id,
        type: "invoice" as const,
        name: inv.invoiceNumber,
        meta: `${inv.customer.name} • ₹${inv.total.toLocaleString("en-IN")}`,
        deletedAt: (inv.deletedAt as Date).toISOString(),
        // Retained indefinitely — never auto-purged, see comment above.
        daysLeft: -1,
        deletedBy: deletedByMap.get(inv.id),
      })),
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
          protectedReason: customerBlockMap.get(c.id),
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
          protectedReason: productBlockMap.get(p.id),
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
          protectedReason: vendorBlockMap.get(v.id),
        };
      }),
      ...purchaseBills.map((b) => ({
        id: b.id,
        type: "purchase_bill" as const,
        name: b.billNumber,
        meta: `${b.vendor.name} • ₹${b.total.toLocaleString("en-IN")}`,
        deletedAt: (b.deletedAt as Date).toISOString(),
        // Retained indefinitely — never auto-purged, see comment above.
        daysLeft: -1,
        deletedBy: deletedByMap.get(b.id),
      })),
      ...returns.map((r) => ({
        id: r.id,
        type: "return" as const,
        name: r.creditNoteNumber ?? "Credit Note",
        meta: `${r.invoice.invoiceNumber} • ${r.invoice.customer.name} • ₹${r.total.toLocaleString("en-IN")}`,
        deletedAt: (r.deletedAt as Date).toISOString(),
        // Retained indefinitely — never auto-purged, see comment above.
        daysLeft: -1,
        deletedBy: deletedByMap.get(r.id),
      })),
      ...rateLists.map((r) => {
        const daysSince = Math.floor((now - (r.deletedAt as Date).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: r.id,
          type: "rate_list" as const,
          name: r.title,
          meta: `${r._count.items} item${r._count.items !== 1 ? "s" : ""}`,
          deletedAt: (r.deletedAt as Date).toISOString(),
          daysLeft: Math.max(0, 30 - daysSince),
          deletedBy: deletedByMap.get(r.id),
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
