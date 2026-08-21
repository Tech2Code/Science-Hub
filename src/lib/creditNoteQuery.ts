import { Prisma } from "@prisma/client";

// Shared between the credit-notes list and stats routes. Credit notes have no status concept (unlike invoices/bills).
export type CreditNoteSort = "newest" | "oldest" | "amount_high" | "amount_low" | "customer_az" | "customer_za";

export interface CreditNoteListFilters {
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Matches credit note number, invoice number, and customer name — no formatted-date
// text match (e.g. "25 jul") since that has no clean server-side equivalent.
export function buildReturnWhere(filters: CreditNoteListFilters): Prisma.ReturnWhereInput {
  const { search, dateRange } = filters;
  const where: Prisma.ReturnWhereInput = { deletedAt: null };
  if (dateRange) where.date = dateRange;
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { creditNoteNumber: { contains: q, mode: "insensitive" } },
      { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
      { invoice: { customer: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export function buildReturnOrderBy(sort?: CreditNoteSort): Prisma.ReturnOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":      return [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }];
    case "amount_high": return [{ total: "desc" }, { id: "asc" }];
    case "amount_low":  return [{ total: "asc" }, { id: "asc" }];
    case "customer_az": return [{ invoice: { customer: { name: "asc" } } }, { id: "asc" }];
    case "customer_za": return [{ invoice: { customer: { name: "desc" } } }, { id: "asc" }];
    case "newest":
    default:            return [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }];
  }
}
