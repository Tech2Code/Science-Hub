import { Prisma } from "@prisma/client";

// Shared between the credit-notes list route and its stats route so the two
// can't drift on what search/date-range mean. Credit notes have no status
// concept (unlike invoices/purchase bills).
export type CreditNoteSort = "newest" | "oldest" | "amount_high" | "amount_low" | "customer_az" | "customer_za";

export interface CreditNoteListFilters {
  search?: string;
  dateRange?: { gte: Date; lt: Date };
}

// Search matches credit note number, the invoice it's against, and the
// customer name — dropping the old client-side match against the
// *formatted* date/time text (e.g. typing "25 jul"), which has no clean
// server-side equivalent without raw date-formatting SQL and was a minor
// convenience next to the other three fields.
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
