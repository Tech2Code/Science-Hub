import { Prisma } from "@prisma/client";

// Shared between the purchase-bills list route and its stats route so the
// two can't drift on what "status=overdue"/search/date-range mean.
export type PurchaseBillSort = "newest" | "oldest" | "vendor_az" | "vendor_za" | "amount_high" | "amount_low" | "balance_high";

export interface PurchaseBillListFilters {
  status?: string | null;
  vendorId?: string | null;
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Search matches the same fields the purchase-bills list page used to
// filter client-side: bill number, vendor name/company, category, the
// staff member who created it, and item/product/brand/category.
export function buildBillWhere(filters: PurchaseBillListFilters): Prisma.PurchaseBillWhereInput {
  const { status, vendorId, search, dateRange } = filters;
  const where: Prisma.PurchaseBillWhereInput = { deletedAt: null };
  if (status === "overdue") {
    where.status = { notIn: ["paid", "cancelled"] };
    where.dueDate = { lt: new Date() };
  } else if (status) {
    where.status = status;
  }
  if (vendorId) where.vendorId = vendorId;
  if (dateRange) where.billDate = dateRange;
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { billNumber: { contains: q, mode: "insensitive" } },
      { vendor: { name: { contains: q, mode: "insensitive" } } },
      { vendor: { company: { contains: q, mode: "insensitive" } } },
      { category: { contains: q, mode: "insensitive" } },
      { createdBy: { name: { contains: q, mode: "insensitive" } } },
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

export function buildBillOrderBy(sort?: PurchaseBillSort): Prisma.PurchaseBillOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":      return [{ createdAt: "asc" }, { id: "asc" }];
    case "vendor_az":   return [{ vendor: { name: "asc" } }, { id: "asc" }];
    case "vendor_za":   return [{ vendor: { name: "desc" } }, { id: "asc" }];
    case "amount_high": return [{ total: "desc" }, { id: "asc" }];
    case "amount_low":  return [{ total: "asc" }, { id: "asc" }];
    case "balance_high": return [{ balanceDue: "desc" }, { id: "asc" }];
    case "newest":
    default:            return [{ createdAt: "desc" }, { id: "asc" }];
  }
}
