import { Prisma } from "@prisma/client";

export type VendorSort = "name_az" | "name_za" | "bills_high" | "bills_low" | "newest" | "oldest";

// Search matches the same fields the vendors list page used to filter
// client-side: name, company, GSTIN, phone, email.
export function buildVendorWhere(search?: string | null): Prisma.VendorWhereInput {
  const where: Prisma.VendorWhereInput = { deletedAt: null };
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { gstin: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildVendorOrderBy(sort?: VendorSort): Prisma.VendorOrderByWithRelationInput[] {
  switch (sort) {
    case "name_za":    return [{ name: "desc" }, { id: "asc" }];
    // Counts every purchase bill (Prisma can't filter a relation-count orderBy); displayed
    // count excludes soft-deleted bills, so they can diverge for vendors with deleted bills.
    case "bills_high": return [{ purchaseBills: { _count: "desc" } }, { id: "asc" }];
    case "bills_low":  return [{ purchaseBills: { _count: "asc" } }, { id: "asc" }];
    case "oldest":     return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":     return [{ createdAt: "desc" }, { id: "asc" }];
    case "name_az":
    default:           return [{ name: "asc" }, { id: "asc" }];
  }
}
