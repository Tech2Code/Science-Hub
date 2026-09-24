import { Prisma } from "@prisma/client";

export type RateListSort = "newest" | "oldest" | "title_az" | "title_za";

export function buildRateListWhere(search?: string | null): Prisma.RateListWhereInput {
  const where: Prisma.RateListWhereInput = { deletedAt: null };
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { createdBy: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export function buildRateListOrderBy(sort?: RateListSort): Prisma.RateListOrderByWithRelationInput[] {
  switch (sort) {
    case "title_az": return [{ title: "asc" }, { id: "asc" }];
    case "title_za": return [{ title: "desc" }, { id: "asc" }];
    case "oldest":   return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":
    default:         return [{ createdAt: "desc" }, { id: "asc" }];
  }
}
