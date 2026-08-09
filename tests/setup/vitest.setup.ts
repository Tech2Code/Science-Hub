import { vi } from "vitest";

// Route handlers call revalidateTag() after every mutation (see CLAUDE.md).
// Outside a real Next.js request context (which is what we have when a test
// imports and calls an exported route handler directly) there is no
// work-unit/static-generation store for it to write to, so the real
// implementation throws. It's cache invalidation — irrelevant to what these
// tests assert — so it's replaced with a no-op everywhere.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
