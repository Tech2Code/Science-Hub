import { Prisma } from "@prisma/client";

export type BrandSort = "name_az" | "name_za" | "products_high" | "products_low" | "newest" | "oldest";

export function buildBrandWhere(search?: string | null): Prisma.BrandWhereInput {
  const where: Prisma.BrandWhereInput = { deletedAt: null };
  if (search?.trim()) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  return where;
}

export function buildBrandOrderBy(sort?: BrandSort): Prisma.BrandOrderByWithRelationInput[] {
  switch (sort) {
    case "name_za":       return [{ name: "desc" }, { id: "asc" }];
    case "products_high": return [{ products: { _count: "desc" } }, { id: "asc" }];
    case "products_low":  return [{ products: { _count: "asc" } }, { id: "asc" }];
    case "oldest":        return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":        return [{ createdAt: "desc" }, { id: "asc" }];
    case "name_az":
    default:              return [{ name: "asc" }, { id: "asc" }];
  }
}
