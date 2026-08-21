import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { deleteAttachmentBlob } from "@/lib/blobStorage";
import { requireAdmin } from "@/lib/apiAuth";

// Mirrors /api/bin/[type]/[id] DELETE's per-type rules, but runs invoices/purchase bills first so dependent customers/vendors/products can clear too.
export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const [invoices, customers, products, brands, categories, vendors, purchaseBills, returns] = await Promise.all([
      prisma.invoice.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.customer.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.product.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.brand.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.category.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.vendor.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.purchaseBill.findMany({ where: { deletedAt: { not: null } }, select: { id: true, attachmentUrl: true } }),
      prisma.return.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
    ]);

    let deleted = 0;
    let skipped = 0;

    // Invoices — cascade handles items/payments
    if (invoices.length > 0) {
      const r = await prisma.invoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } });
      deleted += r.count;
    }

    // Purchase bills — cascade handles items/payments; clean up attachments
    if (purchaseBills.length > 0) {
      await prisma.purchaseBill.deleteMany({ where: { id: { in: purchaseBills.map((b) => b.id) } } });
      await Promise.all(purchaseBills.map((b) => deleteAttachmentBlob(b.attachmentUrl)));
      deleted += purchaseBills.length;
    }

    // Customers — skip any still referenced by invoices; batched groupBy instead of a per-row count to avoid N+1 (this route processes every binned item regardless of age).
    if (customers.length > 0) {
      const customerIds = customers.map((c) => c.id);
      const referencedByInvoices = await prisma.invoice.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds } } });
      const blockedCustomerIds = new Set(referencedByInvoices.map((r) => r.customerId));
      const deletableCustomerIds = customerIds.filter((id) => !blockedCustomerIds.has(id));
      if (deletableCustomerIds.length > 0) {
        const r = await prisma.customer.deleteMany({ where: { id: { in: deletableCustomerIds } } });
        deleted += r.count;
      }
      skipped += blockedCustomerIds.size;
    }

    // Products — skip any still referenced by invoice/purchase items. Stock movements aren't checked since their productId is nullable (SetNull).
    if (products.length > 0) {
      const productIds = products.map((p) => p.id);
      const [referencedByInvoiceItems, referencedByPurchaseItems] = await Promise.all([
        prisma.invoiceItem.groupBy({ by: ["productId"], where: { productId: { in: productIds } } }),
        prisma.purchaseBillItem.groupBy({ by: ["productId"], where: { productId: { in: productIds } } }),
      ]);
      const blockedProductIds = new Set([
        ...referencedByInvoiceItems.map((r) => r.productId),
        ...referencedByPurchaseItems.map((r) => r.productId).filter((id): id is string => id !== null),
      ]);
      const deletableProductIds = productIds.filter((id) => !blockedProductIds.has(id));
      if (deletableProductIds.length > 0) {
        const r = await prisma.product.deleteMany({ where: { id: { in: deletableProductIds } } });
        deleted += r.count;
      }
      skipped += blockedProductIds.size;
    }

    // Brands — nothing blocks a purge (unlike customers/products/vendors), so this is a plain unassign + delete, not a filter.
    if (brands.length > 0) {
      const brandIds = brands.map((b) => b.id);
      await prisma.product.updateMany({ where: { brandId: { in: brandIds } }, data: { brandId: null } });
      const r = await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
      deleted += r.count;
    }

    // Categories — unassign any remaining products, then delete
    if (categories.length > 0) {
      const categoryIds = categories.map((c) => c.id);
      await prisma.product.updateMany({ where: { categoryId: { in: categoryIds } }, data: { categoryId: null } });
      const r = await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      deleted += r.count;
    }

    // Vendors — skip any still referenced by purchase bills (the bulk purge
    // above already cleared out any binned ones)
    if (vendors.length > 0) {
      const vendorIds = vendors.map((v) => v.id);
      const referencedByBills = await prisma.purchaseBill.groupBy({ by: ["vendorId"], where: { vendorId: { in: vendorIds } } });
      const blockedVendorIds = new Set(referencedByBills.map((r) => r.vendorId));
      const deletableVendorIds = vendorIds.filter((id) => !blockedVendorIds.has(id));
      if (deletableVendorIds.length > 0) {
        const r = await prisma.vendor.deleteMany({ where: { id: { in: deletableVendorIds } } });
        deleted += r.count;
      }
      skipped += blockedVendorIds.size;
    }

    // Credit notes — nothing else references them, always safe to purge
    if (returns.length > 0) {
      const r = await prisma.return.deleteMany({ where: { id: { in: returns.map((x) => x.id) } } });
      deleted += r.count;
    }

    await logActivity(
      auth.session.user.id,
      "empty_bin",
      `Emptied recycle bin: ${deleted} item(s) permanently deleted${skipped > 0 ? `, ${skipped} skipped (still referenced elsewhere)` : ""}`
    );

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("customers", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("vendors", { expire: 0 });
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    return NextResponse.json({ deleted, skipped });
  } catch (error) {
    console.error("DELETE /api/bin/empty error:", error);
    return NextResponse.json({ error: "Failed to empty bin" }, { status: 500 });
  }
}
