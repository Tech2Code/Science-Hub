// Shared helpers for server-side pagination + search on API routes whose
// underlying table grows unbounded (e.g. activity log). Client-side
// paginate-in-browser (see src/components/ui/Pagination.tsx) stays the
// default for bounded lists (invoices, customers, products, ...) — only
// reach for these when a table has no natural cap.

export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Parses `limit`/`offset` query params. Returns null if either is invalid. */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  { defaultLimit = 100, maxLimit = 500 }: { defaultLimit?: number; maxLimit?: number } = {}
): PaginationParams | null {
  const limitParam = parseInt(searchParams.get("limit") || String(defaultLimit));
  const offsetParam = parseInt(searchParams.get("offset") || "0");
  if (!Number.isFinite(limitParam) || limitParam < 0 || !Number.isFinite(offsetParam) || offsetParam < 0) {
    return null;
  }
  return { limit: Math.min(limitParam, maxLimit), offset: offsetParam };
}

type SearchWhere = { OR: Record<string, unknown>[] };

/**
 * Builds a Prisma case-insensitive `contains` OR-clause across the given
 * field paths. A path with a dot (e.g. "user.name") builds a one-level
 * relation filter: { user: { name: { contains, mode: "insensitive" } } }.
 * Returns undefined when `search` is empty, so callers can spread the
 * result straight into a `where` object without an extra branch.
 */
export function buildSearchWhere(search: string | undefined, fields: string[]): SearchWhere | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  return {
    OR: fields.map((field) => {
      const [relation, nested] = field.split(".");
      const condition = { contains: term, mode: "insensitive" as const };
      return nested ? { [relation]: { [nested]: condition } } : { [relation]: condition };
    }),
  };
}
