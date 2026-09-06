import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

describe.skipIf(!hasTestDatabase)("POST /api/vendors", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("creates a regular vendor", async () => {
    const { POST } = await import("@/app/api/vendors/route");
    const res = await POST(jsonRequest("http://localhost/api/vendors", "POST", {
      name: "Acme Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.deletedAt).toBeNull();
  });

  it("does not require a phone number (regression: phone was made optional)", async () => {
    const { POST } = await import("@/app/api/vendors/route");
    const res = await POST(jsonRequest("http://localhost/api/vendors", "POST", {
      name: "No Phone Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001",
    }));
    expect(res.status).toBe(201);
  });

  it("soft-deletes a one-off vendor at creation", async () => {
    const { POST } = await import("@/app/api/vendors/route");
    const res = await POST(jsonRequest("http://localhost/api/vendors", "POST", {
      name: "One Off Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001", oneOff: true,
    }));
    const data = await res.json();
    const row = await testPrisma.vendor.findUnique({ where: { id: data.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  // Regression: vendor create had no idempotency-key protection at all — a double-click or
  // retried submission could silently create two identical vendor rows.
  it("a retried submission with the same idempotency key returns the original vendor instead of creating a duplicate", async () => {
    const { POST } = await import("@/app/api/vendors/route");
    const body = {
      name: "Dedupe Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001",
      idempotencyKey: "key-dedupe-1",
    };
    const first = await POST(jsonRequest("http://localhost/api/vendors", "POST", body));
    expect(first.status).toBe(201);
    const firstData = await first.json();

    const second = await POST(jsonRequest("http://localhost/api/vendors", "POST", body));
    expect(second.status).toBe(200);
    const secondData = await second.json();
    expect(secondData.id).toBe(firstData.id);

    const count = await testPrisma.vendor.count({ where: { name: "Dedupe Supplies" } });
    expect(count).toBe(1);
  });
});

describe.skipIf(!hasTestDatabase)("PUT /api/vendors/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  // Regression test mirroring the customer-side fix: editing a one-off
  // vendor (created via a purchase bill's "just for this bill" option)
  // before the bill it belongs to is even saved must succeed.
  it("allows editing a one-off (never explicitly bin-deleted) vendor", async () => {
    const vendor = await testPrisma.vendor.create({
      data: { name: "One Off", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    const { PUT } = await import("@/app/api/vendors/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/vendors/${vendor.id}`, "PUT", {
        name: "One Off Edited", address: "x", city: "x", state: "x", pincode: "110001",
      }),
      paramsOf(vendor.id)
    );
    expect(res.status).toBe(200);
  });

  it("still blocks editing a vendor that was genuinely sent to the bin", async () => {
    const user = await testPrisma.user.findFirstOrThrow();
    const vendor = await testPrisma.vendor.create({
      data: { name: "Binned", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    await testPrisma.activityLog.create({
      data: { userId: user.id, action: "delete_vendor", details: "Deleted", entityId: vendor.id, entityType: "vendor" },
    });
    const { PUT } = await import("@/app/api/vendors/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/vendors/${vendor.id}`, "PUT", {
        name: "Should Not Save", address: "x", city: "x", state: "x", pincode: "110001",
      }),
      paramsOf(vendor.id)
    );
    expect(res.status).toBe(400);
  });
});
