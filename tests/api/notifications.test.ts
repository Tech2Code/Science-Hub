import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

describe.skipIf(!hasTestDatabase)("GET /api/notifications", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("omits binExpiring for a manager (no Bin access)", async () => {
    const user = await seedUser({ role: "manager" });
    mockSession({ id: user.id, role: "manager" });
    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.binExpiring).toBeNull();
  });

  it("includes binExpiring for staff/admin", async () => {
    const user = await seedUser({ role: "staff" });
    mockSession({ id: user.id, role: "staff" });
    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET();
    const data = await res.json();
    expect(data.binExpiring).not.toBeNull();
  });

  it("rejects an unauthenticated request", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)("POST/DELETE /api/notifications/dismiss", () => {
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    userId = user.id;
    mockSession({ id: user.id, role: "staff" });
    const product = await testPrisma.product.create({
      data: { name: "Out Of Stock Widget", price: 100, stock: 0, minStock: 5 },
    });
    productId = product.id;
  });

  it("rejects an invalid category", async () => {
    const { POST } = await import("@/app/api/notifications/dismiss/route");
    const res = await POST(jsonRequest("http://localhost/api/notifications/dismiss", "POST", { category: "not-a-real-category", entityId: productId }));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized entityId", async () => {
    const { POST } = await import("@/app/api/notifications/dismiss/route");
    const res = await POST(jsonRequest("http://localhost/api/notifications/dismiss", "POST", { category: "stock", entityId: "x".repeat(201) }));
    expect(res.status).toBe(400);
  });

  it("hides a dismissed item from the active summary for that user only, and resurfaces it on undo", async () => {
    const { GET: getSummary } = await import("@/app/api/notifications/route");
    const before = await (await getSummary()).json();
    expect(before.stock.items.some((i: { id: string }) => i.id === productId)).toBe(true);

    const { POST } = await import("@/app/api/notifications/dismiss/route");
    const dismissRes = await POST(jsonRequest("http://localhost/api/notifications/dismiss", "POST", { category: "stock", entityId: productId }));
    expect(dismissRes.status).toBe(200);

    const afterDismiss = await (await getSummary()).json();
    expect(afterDismiss.stock.items.some((i: { id: string }) => i.id === productId)).toBe(false);

    // A different user's dismissal set is independent — the item must still be active for them.
    const otherUser = await seedUser();
    mockSession({ id: otherUser.id, role: "staff" });
    const otherUserSummary = await (await getSummary()).json();
    expect(otherUserSummary.stock.items.some((i: { id: string }) => i.id === productId)).toBe(true);

    // Undo (DELETE, via query string) as the original user resurfaces it immediately.
    mockSession({ id: userId, role: "staff" });
    const { DELETE } = await import("@/app/api/notifications/dismiss/route");
    const undoRes = await DELETE(jsonRequest(`http://localhost/api/notifications/dismiss?category=stock&entityId=${productId}`, "DELETE"));
    expect(undoRes.status).toBe(200);
    const afterUndo = await (await getSummary()).json();
    expect(afterUndo.stock.items.some((i: { id: string }) => i.id === productId)).toBe(true);
  });
});
