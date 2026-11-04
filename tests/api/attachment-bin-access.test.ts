import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
// The blob store is external; this test is about WHO may reach the file, so the store itself is stubbed.
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({ statusCode: 200, stream: new Response("%PDF-1.4").body, blob: { contentType: "application/pdf" } })),
}));
vi.mock("@/lib/blobStorage", async (orig) => ({ ...(await orig<typeof import("@/lib/blobStorage")>()), getPrivateBlobToken: () => "test-token" }));

// Regression: GET /api/purchase-bills/[id]/attachment/[filename] hides a binned bill's file from non-admins, but the
// pending-upload route addressed the same blob by its storage path and only checked "logged in".
describe.skipIf(!hasTestDatabase)("GET /api/purchase-bills/attachment/[folder]/[filename]", () => {
  const folder = "a1b2c3d4"; const filename = "bill.pdf";
  const call = async () => {
    const { GET } = await import("@/app/api/purchase-bills/attachment/[folder]/[filename]/route");
    return GET(jsonRequest("http://localhost/x", "GET") as never, paramsOf("", { folder, filename }) as never);
  };

  async function makeBill(deleted: boolean) {
    const user = await seedUser({ role: "admin" });
    const vendor = await testPrisma.vendor.create({ data: { name: "V", address: "1 St", city: "Delhi", state: "Delhi", pincode: "110001" } });
    return testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-TEST-1", vendorId: vendor.id, createdByUserId: user.id, subtotal: 0, total: 0,
        attachmentUrl: `https://store.private.blob.vercel-storage.com/purchase-bills/${folder}/${filename}`, attachmentName: filename,
        deletedAt: deleted ? new Date() : null,
      },
    });
  }

  beforeEach(async () => { await resetDb(); });

  it("a manager cannot read a binned bill's attachment through the pending-upload route", async () => {
    await makeBill(true);
    mockSession({ id: (await seedUser({ role: "manager" })).id, role: "manager" });
    expect((await call()).status).toBe(404);
  });

  it("an admin still can", async () => {
    await makeBill(true);
    mockSession({ id: (await seedUser({ role: "admin" })).id, role: "admin" });
    expect((await call()).status).toBe(200);
  });

  it("a live (not binned) bill's attachment is still served to any logged-in user", async () => {
    await makeBill(false);
    mockSession({ id: (await seedUser({ role: "manager" })).id, role: "manager" });
    expect((await call()).status).toBe(200);
  });

  it("a just-uploaded file that belongs to no bill yet is served (the Edit form's preview)", async () => {
    mockSession({ id: (await seedUser({ role: "staff" })).id, role: "staff" });
    expect((await call()).status).toBe(200);
  });
});
