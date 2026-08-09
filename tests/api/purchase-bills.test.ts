import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeVendor(overrides: Partial<{ state: string }> = {}) {
  return testPrisma.vendor.create({
    data: { name: "Acme Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001", ...overrides },
  });
}

async function makeProduct(overrides: Partial<{ stock: number; minStock: number }> = {}) {
  return testPrisma.product.create({
    data: { name: "Beaker", price: 100, stock: overrides.stock ?? 10, minStock: overrides.minStock ?? 2 },
  });
}

const baseItem = { name: "Beaker", quantity: 3, purchasePrice: 100, gstRate: 18, unit: "Nos", hsn: "", discountPercent: 0 };

describe.skipIf(!hasTestDatabase)("POST /api/purchase-bills", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("creates a bill with a valid vendor/items, auto-numbers it, and increments stock", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct({ stock: 10 });
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id,
      items: [{ ...baseItem, productId: product.id, quantity: 3 }],
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.billNumber).toMatch(/^PB-\d{4}-0001$/);

    const updatedProduct = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct?.stock).toBe(13);
  });

  it("rejects a request with no vendorId", async () => {
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      items: [baseItem],
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a vendorId that doesn't exist", async () => {
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: "nonexistent-id", items: [baseItem],
    }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty items array", async () => {
    const vendor = await makeVendor();
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id, items: [],
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a negative bill-level discount", async () => {
    const vendor = await makeVendor();
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id, items: [baseItem], discount: -50,
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/discount/i);
  });

  it("rejects an unauthenticated request", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue(null);
    const vendor = await makeVendor();
    const { POST } = await import("@/app/api/purchase-bills/route");
    const res = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id, items: [baseItem],
    }));
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)("PUT /api/purchase-bills/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("reverses and reapplies stock correctly when an item's quantity changes", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct({ stock: 10 });
    const { POST } = await import("@/app/api/purchase-bills/route");
    const createRes = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id,
      items: [{ ...baseItem, productId: product.id, quantity: 3 }],
    }));
    const created = await createRes.json();
    // Stock is now 13 (10 + 3).

    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${created.id}`, "PUT", {
        items: [{ ...baseItem, productId: product.id, quantity: 5 }],
      }),
      paramsOf(created.id)
    );
    expect(res.status).toBe(200);

    // Reverse old (-3 => 10), then apply new (+5 => 15).
    const updatedProduct = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct?.stock).toBe(15);
  });

  // Regression test: item edits on a paid/cancelled bill used to be allowed,
  // silently desyncing the bill's recorded total from its recorded payments.
  it("blocks item changes on a paid bill", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0001", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 118, status: "paid", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", {
        items: [baseItem],
      }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/paid/i);
  });

  it("blocks item changes on a cancelled bill", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0002", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 0, status: "cancelled", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", {
        items: [baseItem],
      }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/cancelled/i);
  });

  // Regression test: the bill-level discount is also part of the total, so it
  // must be gated by the same paid/cancelled guard as item edits — otherwise
  // a paid bill's total (and hence its "paid" status) could be changed after
  // the fact without touching a single item.
  it("blocks a bill-level discount change on a paid bill", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0003", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 118, status: "paid", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", { discount: 10 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/paid/i);
  });

  it("blocks a bill-level discount change on a cancelled bill", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0004", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 0, status: "cancelled", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", { discount: 10 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/cancelled/i);
  });

  it("rejects a negative discount value", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0005", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 0, status: "unpaid", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", { discount: -5 }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects a NaN discount value", async () => {
    const vendor = await makeVendor();
    const user = await testPrisma.user.findFirstOrThrow();
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0006", vendorId: vendor.id, subtotal: 100, taxAmount: 18,
        total: 118, paidAmount: 0, status: "unpaid", createdByUserId: user.id,
      },
    });
    const { PUT } = await import("@/app/api/purchase-bills/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/purchase-bills/${bill.id}`, "PUT", { discount: "not-a-number" }),
      paramsOf(bill.id)
    );
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hasTestDatabase)("DELETE /api/purchase-bills/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("reverses stock on delete and is double-delete safe", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct({ stock: 10 });
    const { POST } = await import("@/app/api/purchase-bills/route");
    const createRes = await POST(jsonRequest("http://localhost/api/purchase-bills", "POST", {
      vendorId: vendor.id,
      items: [{ ...baseItem, productId: product.id, quantity: 3 }],
    }));
    const created = await createRes.json();
    // Stock is now 13 (10 + 3).

    const { DELETE } = await import("@/app/api/purchase-bills/[id]/route");
    const res1 = await DELETE(jsonRequest(`http://localhost/api/purchase-bills/${created.id}`, "DELETE"), paramsOf(created.id));
    expect(res1.status).toBe(200);

    const afterFirstDelete = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterFirstDelete?.stock).toBe(10);

    // Deleting the already-deleted bill again must not reverse stock a second time.
    const res2 = await DELETE(jsonRequest(`http://localhost/api/purchase-bills/${created.id}`, "DELETE"), paramsOf(created.id));
    expect(res2.status).toBe(200);
    const msg2 = await res2.json();
    expect(msg2.message).toMatch(/already deleted/i);

    const afterSecondDelete = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterSecondDelete?.stock).toBe(10);
  });
});
