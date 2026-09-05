import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

describe.skipIf(!hasTestDatabase)("GET /api/customers/[id]/statement", () => {
  let customerId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
    const customer = await testPrisma.customer.create({
      data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
    });
    customerId = customer.id;
  });

  it("403s a staff user without the payments_received section", async () => {
    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/customers/${customerId}/statement`, "GET"), paramsOf(customerId));
    expect(res.status).toBe(403);
  });

  it("200s a staff user who has the payments_received section", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "staff", sections: ["payments_received"] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/customers/${customerId}/statement`, "GET"), paramsOf(customerId));
    expect(res.status).toBe(200);
  });

  it("200s an admin regardless of section grants", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "admin", sections: [] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/customers/${customerId}/statement`, "GET"), paramsOf(customerId));
    expect(res.status).toBe(200);
  });

  it("404s an unknown customer id", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "admin", sections: [] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest("http://localhost/api/customers/nonexistent/statement", "GET"), paramsOf("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("still finds a soft-deleted customer with an active invoice", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "admin", sections: [] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const user = await seedUser();
    await testPrisma.invoice.create({
      data: {
        invoiceNumber: `SH-TEST-${Math.random().toString(36).slice(2)}`,
        customerId, userId: user.id, placeOfSupply: "Delhi", subtotal: 100, total: 100,
      },
    });
    await testPrisma.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } });

    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/customers/${customerId}/statement`, "GET"), paramsOf(customerId));
    expect(res.status).toBe(200);
  });

  it("400s on an invalid date filter instead of silently ignoring it", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "admin", sections: [] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const { GET } = await import("@/app/api/customers/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/customers/${customerId}/statement?from=notadate`, "GET"), paramsOf(customerId));
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hasTestDatabase)("GET /api/vendors/[id]/statement", () => {
  let vendorId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
    const vendor = await testPrisma.vendor.create({
      data: { name: "Test Vendor", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
    });
    vendorId = vendor.id;
  });

  it("403s a staff user without the payments_made section", async () => {
    const { GET } = await import("@/app/api/vendors/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/vendors/${vendorId}/statement`, "GET"), paramsOf(vendorId));
    expect(res.status).toBe(403);
  });

  it("200s a staff user who has the payments_made section", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1", role: "staff", sections: ["payments_made"] },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    const { GET } = await import("@/app/api/vendors/[id]/statement/route");
    const res = await GET(jsonRequest(`http://localhost/api/vendors/${vendorId}/statement`, "GET"), paramsOf(vendorId));
    expect(res.status).toBe(200);
  });
});
