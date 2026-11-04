import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!hasTestDatabase)("activity-log protection", () => {
  let admin: { id: string };

  beforeEach(async () => {
    await resetDb();
    admin = await seedUser({ role: "admin" });
    mockSession({ id: admin.id, role: "admin" });
  });

  async function log(action: string, entityType: string | null, entityId: string | null, ageDays: number, userId = admin.id) {
    return testPrisma.activityLog.create({
      data: { userId, action, details: "x", entityType, entityId, createdAt: new Date(Date.now() - ageDays * DAY) },
    });
  }

  it("the 30-day purge keeps Bin markers and creator rows but still removes ordinary old rows", async () => {
    const binMarker = await log("delete_customer", "customer", "c1", 45);
    const creator = await log("add_product", "product", "p1", 45);
    const ordinary = await log("update_customer", "customer", "c1", 45);
    const recent = await log("update_customer", "customer", "c1", 1);

    const { GET } = await import("@/app/api/admin/activity/route");
    const res = await GET(jsonRequest("http://localhost/api/admin/activity?limit=50&offset=0", "GET") as never);
    expect(res.status).toBe(200);

    const remaining = (await testPrisma.activityLog.findMany({ select: { id: true } })).map((r) => r.id);
    expect(remaining).toContain(binMarker.id);
    expect(remaining).toContain(creator.id);
    expect(remaining).toContain(recent.id);
    expect(remaining).not.toContain(ordinary.id);
  });

  it("'Delete All' keeps the state-bearing rows and reports how many it kept", async () => {
    await log("delete_vendor", "vendor", "v1", 1);
    await log("add_brand", "brand", "b1", 1);
    await log("update_customer", "customer", "c1", 1);

    const { DELETE } = await import("@/app/api/admin/activity/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kept).toBe(2);

    const actions = (await testPrisma.activityLog.findMany({ select: { action: true } })).map((r) => r.action).sort();
    expect(actions).toEqual(["add_brand", "clear_activity_log", "delete_vendor"]);
  });

  it("refuses to delete a single state-bearing entry (409) but deletes an ordinary one", async () => {
    const protectedRow = await log("delete_customer", "customer", "c1", 1);
    const ordinary = await log("update_customer", "customer", "c1", 1);

    const { DELETE } = await import("@/app/api/admin/activity/[id]/route");
    const blocked = await DELETE(jsonRequest("http://localhost/x", "DELETE") as never, paramsOf(protectedRow.id));
    expect(blocked.status).toBe(409);
    expect(await testPrisma.activityLog.findUnique({ where: { id: protectedRow.id } })).not.toBeNull();

    const ok = await DELETE(jsonRequest("http://localhost/x", "DELETE") as never, paramsOf(ordinary.id));
    expect(ok.status).toBe(200);
    expect(await testPrisma.activityLog.findUnique({ where: { id: ordinary.id } })).toBeNull();
  });

  it("blocks deleting a user who owns state-bearing rows, and reassign moves those rows so the delete then succeeds", async () => {
    const staff = await seedUser({ role: "staff", name: "Creator Staff" });
    const marker = await log("add_customer", "customer", "c1", 1, staff.id);

    const userRoute = await import("@/app/api/admin/users/[id]/route");
    const blocked = await userRoute.DELETE(jsonRequest("http://localhost/x", "DELETE") as never, paramsOf(staff.id));
    expect(blocked.status).toBe(400);
    const blockedBody = await blocked.json();
    expect(blockedBody.recordCount).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { id: staff.id } })).not.toBeNull();

    const reassignRoute = await import("@/app/api/admin/users/[id]/reassign/route");
    const re = await reassignRoute.POST(jsonRequest("http://localhost/x", "POST", { targetUserId: admin.id }) as never, paramsOf(staff.id));
    expect(re.status).toBe(200);
    expect((await re.json()).recordCount).toBe(1);

    const del = await userRoute.DELETE(jsonRequest("http://localhost/x", "DELETE") as never, paramsOf(staff.id));
    expect(del.status).toBe(200);

    // The marker survived the user's deletion and now belongs to the admin who inherited it.
    const survivor = await testPrisma.activityLog.findUnique({ where: { id: marker.id } });
    expect(survivor?.userId).toBe(admin.id);
  });
});
