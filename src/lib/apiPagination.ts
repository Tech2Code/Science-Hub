// Server-side pagination/search for API routes whose table grows unbounded (e.g. activity log).
// Bounded lists still use client-side Pagination.tsx.

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

// A dotted field path (e.g. "user.name") builds a one-level relation filter. Returns undefined when search is empty.
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
