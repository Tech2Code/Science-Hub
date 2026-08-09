import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeVendor() {
  return testPrisma.vendor.create({
    data: { name: "Acme Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
  });
}

async function makeBill(overrides: Partial<{ total: number; paidAmount: number; status: string }> = {}) {
  const vendor = await makeVendor();
  const user = await testPrisma.user.findFirstOrThrow();
  return testPrisma.purchaseBill.create({
    data: {
      billNumber: `PB-2026-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`,
      vendorId: vendor.id,
      subtotal: overrides.total ?? 1000,
      taxAmount: 0,
      total: overrides.total ?? 1000,
      paidAmount: overrides.paidAmount ?? 0,
      status: overrides.status ?? "unpaid",
      createdByUserId: user.id,
    },
  });
}

describe.skipIf(!hasTestDatabase)("POST /api/purchase-bills/[id]/payment", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("sums ALL PurchasePayment rows into paidAmount rather than incrementing", async () => {
    const bill = await makeBill({ total: 1000 });
    // Seed a payment directly, bypassing the route, to make sure the route
    // recomputes from the full set of rows rather than trusting the bill's
    // own stale paidAmount column.
    await testPrisma.purchasePayment.create({
      data: { purchaseBillId: bill.id, amount: 200, date: new Date() },
    });
    await testPrisma.purchaseBill.update({ where: { id: bill.id }, data: { paidAmount: 200, status: "partial" } });

    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 300 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(201);

    const updated = await testPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    // 200 (seeded) + 300 (this call) = 500, not just 300.
    expect(updated?.paidAmount).toBe(500);
    expect(updated?.status).toBe("partial");
  });

  it("transitions unpaid -> partial at a partial payment", async () => {
    const bill = await makeBill({ total: 1000 });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 400 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(201);
    const updated = await testPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(updated?.status).toBe("partial");
    expect(updated?.paidAmount).toBe(400);
  });

  it("transitions partial -> paid once the full balance is covered", async () => {
    const bill = await makeBill({ total: 1000, paidAmount: 400, status: "partial" });
    await testPrisma.purchasePayment.create({ data: { purchaseBillId: bill.id, amount: 400, date: new Date() } });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 600 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(201);
    const updated = await testPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAmount).toBe(1000);
  });

  it("rejects a payment that would exceed the remaining balance", async () => {
    const bill = await makeBill({ total: 1000, paidAmount: 800, status: "partial" });
    await testPrisma.purchasePayment.create({ data: { purchaseBillId: bill.id, amount: 800, date: new Date() } });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 300 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/exceeds balance/i);

    // The bill's paidAmount/status must be left untouched.
    const unchanged = await testPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(unchanged?.paidAmount).toBe(800);
    expect(unchanged?.status).toBe("partial");
  });

  // Regression test for the bug where a cancelled bill could still receive a
  // payment even though it's no longer owed anything.
  it("rejects a payment against a cancelled bill", async () => {
    const bill = await makeBill({ total: 1000, paidAmount: 0, status: "cancelled" });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 100 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/cancelled/i);

    // No PurchasePayment row must have been created, and the bill must remain untouched.
    const payments = await testPrisma.purchasePayment.findMany({ where: { purchaseBillId: bill.id } });
    expect(payments.length).toBe(0);
    const unchanged = await testPrisma.purchaseBill.findUnique({ where: { id: bill.id } });
    expect(unchanged?.paidAmount).toBe(0);
    expect(unchanged?.status).toBe("cancelled");
  });

  it("rejects a zero or negative payment amount", async () => {
    const bill = await makeBill({ total: 1000 });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 0 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue(null);
    const bill = await makeBill({ total: 1000 });
    const { POST } = await import("@/app/api/purchase-bills/[id]/payment/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}/payment`, "POST", { amount: 100 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(401);
  });
});
