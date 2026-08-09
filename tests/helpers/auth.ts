import { vi } from "vitest";
import { getServerSession } from "next-auth/next";

// Every API test file must call `vi.mock("next-auth/next", () => ({
// getServerSession: vi.fn() }));` at its own top level (vi.mock only hoists
// correctly when written directly in the file that uses it) before importing
// this helper. This just gives the mock a session shape to resolve to,
// matching AuthedSession in src/lib/apiAuth.ts.
export function mockSession(overrides: { id: string; role?: "admin" | "staff" | "manager"; sections?: string[] }) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: overrides.id, role: overrides.role ?? "staff", sections: overrides.sections ?? [] },
    // NextAuth's own Session type wants an expires string — unused by
    // requireSession()/requireWriteAccess(), which only look at user.
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } as never);
}

export function mockNoSession() {
  vi.mocked(getServerSession).mockResolvedValue(null);
}
