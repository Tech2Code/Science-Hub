import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { deleteAttachmentBlob } from "@/lib/blobStorage";
import { requireAdmin } from "@/lib/apiAuth";

// Permanently deletes every soft-deleted item currently in the bin.
// Mirrors the per-type rules in /api/bin/[type]/[id] DELETE, but runs in an
// order (invoices/purchase bills first) that lets customers/vendors/products
// that were only blocked by now-purged bin items clear too.
export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const [invoices, customers, products, brands, categories, vendors, purchaseBills] = await Promise.all([
      prisma.invoice.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.customer.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.product.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.brand.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.category.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.vendor.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
      prisma.purchaseBill.findMany({ where: { deletedAt: { not: null } }, select: { id: true, attachmentUrl: true } }),
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

    // Customers — skip any that still have invoices on record (the bulk
    // purge above already cleared out any binned ones)
    for (const c of customers) {
      const invoiceCount = await prisma.invoice.count({ where: { customerId: c.id } });
      if (invoiceCount > 0) { skipped++; continue; }
      await prisma.customer.delete({ where: { id: c.id } });
      deleted++;
    }

    // Products — skip any still referenced by invoice items or purchase
    // items. Stock movements are not checked — the product relation on
    // StockMovement is nullable with onDelete: SetNull, so those ledger
    // rows survive (with a productName snapshot) instead of blocking this.
    for (const p of products) {
      const [itemCount, purchaseItemCount] = await Promise.all([
        prisma.invoiceItem.count({ where: { productId: p.id } }),
        prisma.purchaseBillItem.count({ where: { productId: p.id } }),
      ]);
      if (itemCount > 0 || purchaseItemCount > 0) { skipped++; continue; }
      await prisma.product.delete({ where: { id: p.id } });
      deleted++;
    }

    // Brands — unassign any remaining products, then delete
    for (const b of brands) {
      await prisma.product.updateMany({ where: { brandId: b.id }, data: { brandId: null } });
      await prisma.brand.delete({ where: { id: b.id } });
      deleted++;
    }

    // Categories — unassign any remaining products, then delete
    for (const cat of categories) {
      await prisma.product.updateMany({ where: { categoryId: cat.id }, data: { categoryId: null } });
      await prisma.category.delete({ where: { id: cat.id } });
      deleted++;
    }

    // Vendors — skip any still referenced by purchase bills (the bulk purge
    // above already cleared out any binned ones)
    for (const v of vendors) {
      const billCount = await prisma.purchaseBill.count({ where: { vendorId: v.id } });
      if (billCount > 0) { skipped++; continue; }
      await prisma.vendor.delete({ where: { id: v.id } });
      deleted++;
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
