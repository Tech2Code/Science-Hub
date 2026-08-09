import { describe, it, expect, beforeEach, vi } from "vitest";
import { getServerSession } from "next-auth/next";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

describe.skipIf(!hasTestDatabase)("POST /api/customers", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("creates a regular customer, visible in the directory", async () => {
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", {
      name: "Acme Labs", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Acme Labs");
    expect(data.deletedAt).toBeNull();
  });

  it("rejects a missing name", async () => {
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("does not require a phone number (regression: phone was made optional)", async () => {
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", {
      name: "No Phone Co", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001",
    }));
    expect(res.status).toBe(201);
  });

  it("soft-deletes a one-off customer at creation, so it never surfaces as a normal record", async () => {
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", {
      name: "One Off Co", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001", oneOff: true,
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    const row = await testPrisma.customer.findUnique({ where: { id: data.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("rejects an authenticated manager (read-only) trying to create a customer", async () => {
    const user = await seedUser({ role: "manager" });
    mockSession({ id: user.id, role: "manager" });
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "Should Fail" }));
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/customers/route");
    const res = await POST(jsonRequest("http://localhost/api/customers", "POST", { name: "Nope" }));
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)("PUT /api/customers/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("edits a regular customer", async () => {
    const { PUT } = await import("@/app/api/customers/[id]/route");
    const customer = await testPrisma.customer.create({
      data: { name: "Old Name", address: "x", city: "x", state: "x", pincode: "110001" },
    });
    const res = await PUT(
      jsonRequest(`http://localhost/api/customers/${customer.id}`, "PUT", {
        name: "New Name", address: "x", city: "x", state: "x", pincode: "110001",
      }),
      paramsOf(customer.id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("New Name");
  });

  // Regression test for the bug found in the last audit: a one-off customer
  // (created via an invoice's "just for this invoice — don't save" option)
  // is soft-deleted from the moment it's created, but editing it from
  // within the still-open invoice form (before the invoice is even saved)
  // must succeed rather than being mistaken for a genuine bin item.
  it("allows editing a one-off (never explicitly bin-deleted) customer", async () => {
    const customer = await testPrisma.customer.create({
      data: { name: "One Off", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    const { PUT } = await import("@/app/api/customers/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/customers/${customer.id}`, "PUT", {
        name: "One Off Edited", address: "x", city: "x", state: "x", pincode: "110001",
      }),
      paramsOf(customer.id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("One Off Edited");
  });

  it("still blocks editing a customer that was genuinely sent to the bin", async () => {
    const user = await testPrisma.user.findFirstOrThrow();
    const customer = await testPrisma.customer.create({
      data: { name: "Binned", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    await testPrisma.activityLog.create({
      data: { userId: user.id, action: "delete_customer", details: "Moved to bin", entityId: customer.id, entityType: "customer" },
    });
    const { PUT } = await import("@/app/api/customers/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/customers/${customer.id}`, "PUT", {
        name: "Should Not Save", address: "x", city: "x", state: "x", pincode: "110001",
      }),
      paramsOf(customer.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/bin/i);
  });
});
