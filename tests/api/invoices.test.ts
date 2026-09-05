import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeCustomer(overrides: Partial<{ deletedAt: Date | null }> = {}) {
  return testPrisma.customer.create({
    data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001", ...overrides },
  });
}

const baseItem = { name: "Widget", qty: 1, price: 100, gstRate: 18, unit: "Nos", hsn: "", discountPercent: 0 };

describe.skipIf(!hasTestDatabase)("POST /api/invoices", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("creates an invoice with a valid customer and auto-numbers it", async () => {
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.invoiceNumber).toMatch(/^SH-\d{4}-0001$/);
  });

  it("rejects a request with no customerId", async () => {
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/customer/i);
  });

  it("rejects a customerId that doesn't exist", async () => {
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: "nonexistent-id", placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(400);
  });

  // A "one-off" customer (created via this same invoice form's "just for
  // this invoice" option) is soft-deleted the instant it's created — the
  // invoice create route must still accept it via its id.
  it("accepts a one-off (soft-deleted) customer", async () => {
    const customer = await makeCustomer({ deletedAt: new Date() });
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(201);
  });

  it("rejects an empty items array", async () => {
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [],
    }));
    expect(res.status).toBe(400);
  });

  // Server-side re-validation independent of the client's own input regex —
  // a crafted request bypassing the UI entirely must still be rejected.
  it("rejects a discountPercent above 100 even though the client UI would normally prevent it", async () => {
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi",
      items: [{ ...baseItem, discountPercent: 150 }],
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/discount/i);
  });

  it("rejects a negative discountPercent", async () => {
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi",
      items: [{ ...baseItem, discountPercent: -10 }],
    }));
    expect(res.status).toBe(400);
  });

  it("decrements stock for a catalog product line item", async () => {
    const customer = await makeCustomer();
    const product = await testPrisma.product.create({
      data: { name: "Beaker", price: 100, stock: 10, minStock: 2 },
    });
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi",
      items: [{ ...baseItem, productId: product.id, qty: 3 }],
    }));
    expect(res.status).toBe(201);
    const updated = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.stock).toBe(7);
  });

  it("rejects an unauthenticated request", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue(null);
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(401);
  });

  describe("idempotencyKey", () => {
    it("returns the same invoice (200) on a retried key instead of creating a second one", async () => {
      const customer = await makeCustomer();
      const { POST } = await import("@/app/api/invoices/route");
      const key = "idem-invoice-key-1";

      const first = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
        customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem], idempotencyKey: key,
      }));
      expect(first.status).toBe(201);
      const firstBody = await first.json();

      const second = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
        customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem], idempotencyKey: key,
      }));
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.id).toBe(firstBody.id);

      const count = await testPrisma.invoice.count({ where: { idempotencyKey: key } });
      expect(count).toBe(1);
    });

    it("rejects an idempotency key longer than 200 characters", async () => {
      const customer = await makeCustomer();
      const { POST } = await import("@/app/api/invoices/route");
      const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
        customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem], idempotencyKey: "x".repeat(201),
      }));
      expect(res.status).toBe(400);
    });
  });
});
