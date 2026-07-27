import { Prisma } from "@prisma/client";

// Shared between the purchase-payments list route and its stats route.
export type PurchasePaymentSort = "newest" | "oldest" | "amount_high" | "amount_low" | "vendor_az" | "vendor_za";

export interface PurchasePaymentListFilters {
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Search matches the same fields the purchase-payments list page used to
// filter client-side: vendor name, bill number, method, reference.
export function buildPurchasePaymentWhere(filters: PurchasePaymentListFilters): Prisma.PurchasePaymentWhereInput {
  const { search, dateRange } = filters;
  const where: Prisma.PurchasePaymentWhereInput = { purchaseBill: { deletedAt: null } };
  if (dateRange) where.date = dateRange;
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { purchaseBill: { billNumber: { contains: q, mode: "insensitive" } } },
      { purchaseBill: { vendor: { name: { contains: q, mode: "insensitive" } } } },
      { method: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildPurchasePaymentOrderBy(sort?: PurchasePaymentSort): Prisma.PurchasePaymentOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":      return [{ date: "asc" }, { id: "asc" }];
    case "amount_high": return [{ amount: "desc" }, { id: "asc" }];
    case "amount_low":  return [{ amount: "asc" }, { id: "asc" }];
    case "vendor_az":   return [{ purchaseBill: { vendor: { name: "asc" } } }, { id: "asc" }];
    case "vendor_za":   return [{ purchaseBill: { vendor: { name: "desc" } } }, { id: "asc" }];
    case "newest":
    default:            return [{ date: "desc" }, { id: "asc" }];
  }
}
