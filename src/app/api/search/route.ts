import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";

const PER_GROUP_LIMIT = 5;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ groups: [] });

    const ci = { contains: q, mode: "insensitive" as const };

    const [invoices, customers, products, vendors, purchaseBills, brands, categories] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          OR: [{ invoiceNumber: ci }, { customer: { name: ci } }],
        },
        select: { id: true, invoiceNumber: true, total: true, status: true, customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [{ name: ci }, { phone: ci }, { email: ci }, { gstin: ci }],
        },
        select: { id: true, name: true, phone: true, email: true },
        orderBy: { name: "asc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.product.findMany({
        where: {
          deletedAt: null,
          OR: [{ name: ci }, { sku: ci }],
        },
        select: { id: true, name: true, sku: true, price: true },
        orderBy: { name: "asc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.vendor.findMany({
        where: {
          deletedAt: null,
          OR: [{ name: ci }, { company: ci }, { phone: ci }, { email: ci }],
        },
        select: { id: true, name: true, company: true },
        orderBy: { name: "asc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.purchaseBill.findMany({
        where: {
          deletedAt: null,
          OR: [{ billNumber: ci }, { vendor: { name: ci } }],
        },
        select: { id: true, billNumber: true, total: true, status: true, vendor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.brand.findMany({
        where: { deletedAt: null, name: ci },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: PER_GROUP_LIMIT,
      }),
      prisma.category.findMany({
        where: { deletedAt: null, name: ci },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: PER_GROUP_LIMIT,
      }),
    ]);

    const groups = [
      {
        type: "invoice",
        label: "Invoices",
        items: invoices.map((inv) => ({
          id: inv.id,
          title: inv.invoiceNumber,
          subtitle: `${inv.customer.name} • ₹${inv.total.toLocaleString("en-IN")} • ${inv.status}`,
          href: `/sales/invoices/${inv.id}`,
        })),
      },
      {
        type: "customer",
        label: "Customers",
        items: customers.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: [c.phone, c.email].filter(Boolean).join(" • "),
          href: `/sales/customers/${c.id}`,
        })),
      },
      {
        type: "product",
        label: "Products",
        items: products.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: [p.sku, `₹${p.price.toLocaleString("en-IN")}`].filter(Boolean).join(" • "),
          href: `/products/${p.id}`,
        })),
      },
      {
        type: "vendor",
        label: "Vendors",
        items: vendors.map((v) => ({
          id: v.id,
          title: v.name,
          subtitle: v.company ?? "",
          href: `/purchases/vendors/${v.id}`,
        })),
      },
      {
        type: "purchase_bill",
        label: "Purchase Bills",
        items: purchaseBills.map((b) => ({
          id: b.id,
          title: b.billNumber,
          subtitle: `${b.vendor.name} • ₹${b.total.toLocaleString("en-IN")} • ${b.status}`,
          href: `/purchases/bills/${b.id}`,
        })),
      },
      {
        type: "brand",
        label: "Brands",
        items: brands.map((b) => ({ id: b.id, title: b.name, subtitle: "", href: `/brands/${b.id}` })),
      },
      {
        type: "category",
        label: "Categories",
        items: categories.map((c) => ({ id: c.id, title: c.name, subtitle: "", href: `/categories/${c.id}` })),
      },
    ].filter((g) => g.items.length > 0);

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
