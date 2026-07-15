import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activity";
import { deleteAttachmentBlob } from "@/lib/blobStorage";

const CONFIRM_PHRASE = "DELETE EVERYTHING";

// Wipes every business record — invoices, purchase bills, customers,
// products, vendors, brands, categories, the stock ledger, and the entire
// activity log — plus every staff account. BusinessSettings (incl. Gmail
// config) and admin accounts are the only things left standing, so the app
// looks freshly installed. Irreversible; admin-only; requires the exact
// confirm phrase server-side too, not just in the UI dialog.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM_PHRASE) {
      return NextResponse.json({ error: "Confirmation phrase did not match." }, { status: 400 });
    }

    // Read attachment URLs before the transaction wipes the rows that hold them.
    const bills = await prisma.purchaseBill.findMany({ select: { attachmentUrl: true } });

    const result = await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({});
      const invoices = await tx.invoice.deleteMany({}); // cascades items/payments/returns
      const purchaseBills = await tx.purchaseBill.deleteMany({}); // cascades items/payments
      const products = await tx.product.deleteMany({});
      const customers = await tx.customer.deleteMany({});
      const vendors = await tx.vendor.deleteMany({});
      const brands = await tx.brand.deleteMany({});
      const categories = await tx.category.deleteMany({});
      await tx.activityLog.deleteMany({});
      await tx.passwordResetToken.deleteMany({});
      const staff = await tx.user.deleteMany({ where: { role: "staff" } });

      return {
        invoices: invoices.count,
        purchaseBills: purchaseBills.count,
        products: products.count,
        customers: customers.count,
        vendors: vendors.count,
        brands: brands.count,
        categories: categories.count,
        staffUsers: staff.count,
      };
    }, { timeout: 60000, maxWait: 15000 });

    await Promise.all(bills.map((b) => deleteAttachmentBlob(b.attachmentUrl)));

    // Logged after the wipe (not before) — a pre-wipe entry would just get
    // deleted by the same activityLog.deleteMany, leaving no record it happened.
    await logActivity(
      auth.session.user.id,
      "factory_reset",
      `Factory reset: ${result.invoices} invoice(s), ${result.purchaseBills} purchase bill(s), ${result.products} product(s), ${result.customers} customer(s), ${result.vendors} vendor(s), ${result.brands} brand(s), ${result.categories} categor${result.categories === 1 ? "y" : "ies"}, and ${result.staffUsers} staff account(s) permanently deleted.`
    );

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("customers", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("vendors", { expire: 0 });
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("reports", { expire: 0 });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/factory-reset error:", error);
    return NextResponse.json({ error: "Failed to reset app data" }, { status: 500 });
  }
}
