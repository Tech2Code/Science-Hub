import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

const baseItem = { name: "Widget", qty: 2, price: 100, gstRate: 18, unit: "Nos", hsn: "", discountPercent: 0 };

// Regression: PUT /api/invoices/[id] with `items: []` used to be treated as "items supplied" (an empty array is truthy),
// so the invoice was saved with no lines, total 0, derived status "paid" and all its stock reversed.
describe.skipIf(!hasTestDatabase)("invoice items validation (POST + PUT)", () => {
  let invoiceId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
    const customer = await testPrisma.customer.create({
      data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
    });
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem],
    }));
    expect(res.status).toBe(201);
    invoiceId = (await res.json()).id;
  });

  it("PUT with an empty items array is rejected and leaves the invoice untouched", async () => {
    const before = await testPrisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true } });
    const { PUT } = await import("@/app/api/invoices/[id]/route");
    const res = await PUT(jsonRequest(`http://localhost/api/invoices/${invoiceId}`, "PUT", { placeOfSupply: "Delhi", items: [] }), paramsOf(invoiceId));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/item/i);
    const after = await testPrisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true } });
    expect(after.total).toBe(before.total);
    expect(after.status).toBe(before.status);
    expect(after.items).toHaveLength(before.items.length);
  });

  it("PUT with a non-array items value is a 400, not a 500", async () => {
    const { PUT } = await import("@/app/api/invoices/[id]/route");
    const res = await PUT(jsonRequest(`http://localhost/api/invoices/${invoiceId}`, "PUT", { placeOfSupply: "Delhi", items: "oops" }), paramsOf(invoiceId));
    expect(res.status).toBe(400);
  });

  it("POST with a non-array items value is a 400, not a 500", async () => {
    const customer = await testPrisma.customer.findFirstOrThrow();
    const { POST } = await import("@/app/api/invoices/route");
    const res = await POST(jsonRequest("http://localhost/api/invoices", "POST", { customerId: customer.id, placeOfSupply: "Delhi", items: { a: 1 } }));
    expect(res.status).toBe(400);
  });

  it("a notes-only PUT (no items key) still works", async () => {
    const { PUT } = await import("@/app/api/invoices/[id]/route");
    const res = await PUT(jsonRequest(`http://localhost/api/invoices/${invoiceId}`, "PUT", { notes: "updated note" }), paramsOf(invoiceId));
    expect(res.status).toBe(200);
    expect((await testPrisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).notes).toBe("updated note");
  });

  it("a normal full edit with items still works", async () => {
    const { PUT } = await import("@/app/api/invoices/[id]/route");
    const res = await PUT(jsonRequest(`http://localhost/api/invoices/${invoiceId}`, "PUT", { placeOfSupply: "Delhi", items: [{ ...baseItem, qty: 3 }] }), paramsOf(invoiceId));
    expect(res.status).toBe(200);
  });
});
