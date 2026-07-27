import { Prisma } from "@prisma/client";

// Shared between the payments-received list route and its stats route.
export type PaymentSort = "newest" | "oldest" | "amount_high" | "amount_low" | "customer_az" | "customer_za";

export interface PaymentListFilters {
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Search matches the same fields the payments list page used to filter
// client-side: customer name, invoice number, method, reference.
export function buildPaymentWhere(filters: PaymentListFilters): Prisma.PaymentWhereInput {
  const { search, dateRange } = filters;
  const where: Prisma.PaymentWhereInput = { invoice: { deletedAt: null } };
  if (dateRange) where.date = dateRange;
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
      { invoice: { customer: { name: { contains: q, mode: "insensitive" } } } },
      { method: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildPaymentOrderBy(sort?: PaymentSort): Prisma.PaymentOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":      return [{ date: "asc" }, { id: "asc" }];
    case "amount_high": return [{ amount: "desc" }, { id: "asc" }];
    case "amount_low":  return [{ amount: "asc" }, { id: "asc" }];
    case "customer_az": return [{ invoice: { customer: { name: "asc" } } }, { id: "asc" }];
    case "customer_za": return [{ invoice: { customer: { name: "desc" } } }, { id: "asc" }];
    case "newest":
    default:            return [{ date: "desc" }, { id: "asc" }];
  }
}
