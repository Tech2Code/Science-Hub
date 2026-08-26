import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest } from "../helpers/request";

function binListRequest() {
  return jsonRequest("http://localhost/api/bin", "GET");
}

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

function binParamsOf(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

describe.skipIf(!hasTestDatabase)("GET /api/bin", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  // Regression test: a one-off customer/vendor is soft-deleted the instant
  // it's created and never gets an explicit delete_customer/delete_vendor
  // log — it must not appear in the bin (it would otherwise permanently
  // clutter it and risk being "Restored" into the live directory by
  // accident, defeating the "don't save" checkbox the user ticked).
  it("excludes a one-off customer from the bin listing", async () => {
    await testPrisma.customer.create({
      data: { name: "One Off", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    const { GET } = await import("@/app/api/bin/route");
    const res = await GET(binListRequest());
    const { items } = await res.json();
    expect(items.some((i: { type: string }) => i.type === "customer")).toBe(false);
  });

  it("excludes a one-off vendor from the bin listing", async () => {
    await testPrisma.vendor.create({
      data: { name: "One Off Supplies", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    const { GET } = await import("@/app/api/bin/route");
    const res = await GET(binListRequest());
    const { items } = await res.json();
    expect(items.some((i: { type: string }) => i.type === "vendor")).toBe(false);
  });

  it("still shows a customer that was genuinely sent to the bin", async () => {
    const user = await testPrisma.user.findFirstOrThrow();
    const customer = await testPrisma.customer.create({
      data: { name: "Really Deleted", address: "x", city: "x", state: "x", pincode: "110001", deletedAt: new Date() },
    });
    await testPrisma.activityLog.create({
      data: { userId: user.id, action: "delete_customer", details: "Moved to bin", entityId: customer.id, entityType: "customer" },
    });
    const { GET } = await import("@/app/api/bin/route");
    const res = await GET(binListRequest());
    const { items } = await res.json();
    const found = items.find((i: { type: string; id: string }) => i.type === "customer" && i.id === customer.id);
    expect(found).toBeDefined();
  });
});

describe.skipIf(!hasTestDatabase)("POST /api/bin/[type]/[id] — invoice restore", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  // Deleting an invoice restores the stock it had consumed; restoring it back
  // out of the bin must re-consume that stock, and must not double-consume it
  // if the restore endpoint is called twice for the same item.
  it("re-decrements stock on restore and is double-restore safe", async () => {
    const customer = await testPrisma.customer.create({
      data: { name: "Test Customer", address: "x", city: "x", state: "x", pincode: "110001" },
    });
    const user = await testPrisma.user.findFirstOrThrow();
    const product = await testPrisma.product.create({ data: { name: "Beaker", price: 100, stock: 20, minStock: 2 } });
    const invoice = await testPrisma.invoice.create({
      data: {
        invoiceNumber: "SH-2026-0099", customerId: customer.id, userId: user.id,
        subtotal: 500, total: 500, deletedAt: new Date(),
        items: { create: [{ productId: product.id, name: "Beaker", hsn: "", quantity: 5, unit: "Nos", price: 100, gstRate: 0, gstAmount: 0, total: 500 }] },
      },
    });

    const { POST } = await import("@/app/api/bin/[type]/[id]/route");
    const res1 = await POST(jsonRequest("http://localhost/api/bin/invoice/x", "POST"), binParamsOf("invoice", invoice.id));
    expect(res1.status).toBe(200);

    const afterFirst = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterFirst?.stock).toBe(15);

    // Restoring an already-restored invoice must not re-decrement stock again.
    const res2 = await POST(jsonRequest("http://localhost/api/bin/invoice/x", "POST"), binParamsOf("invoice", invoice.id));
    expect(res2.status).toBe(200);
    const msg2 = await res2.json();
    expect(msg2.message).toMatch(/already restored/i);

    const afterSecond = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterSecond?.stock).toBe(15);
  });
});

describe.skipIf(!hasTestDatabase)("POST /api/bin/[type]/[id] — purchase bill restore", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  // Deleting a purchase bill reverses the stock it had added; restoring it
  // back out of the bin must re-add that stock, and must not double-add it if
  // the restore endpoint is called twice for the same item.
  it("re-increments stock on restore and is double-restore safe", async () => {
    const vendor = await testPrisma.vendor.create({
      data: { name: "Acme Supplies", address: "x", city: "x", state: "x", pincode: "110001" },
    });
    const user = await testPrisma.user.findFirstOrThrow();
    const product = await testPrisma.product.create({ data: { name: "Beaker", price: 100, stock: 20, minStock: 2 } });
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0099", vendorId: vendor.id, subtotal: 500, taxAmount: 0, total: 500,
        createdByUserId: user.id, deletedAt: new Date(),
        items: { create: [{ productId: product.id, name: "Beaker", hsn: "", quantity: 5, unit: "Nos", purchasePrice: 100, gstRate: 0, gstAmount: 0, total: 500 }] },
      },
    });

    const { POST } = await import("@/app/api/bin/[type]/[id]/route");
    const res1 = await POST(jsonRequest("http://localhost/api/bin/purchase_bill/x", "POST"), binParamsOf("purchase_bill", bill.id));
    expect(res1.status).toBe(200);

    const afterFirst = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterFirst?.stock).toBe(25);

    // Restoring an already-restored bill must not re-increment stock again.
    const res2 = await POST(jsonRequest("http://localhost/api/bin/purchase_bill/x", "POST"), binParamsOf("purchase_bill", bill.id));
    expect(res2.status).toBe(200);
    const msg2 = await res2.json();
    expect(msg2.message).toMatch(/already restored/i);

    const afterSecond = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterSecond?.stock).toBe(25);
  });

  // A cancelled bill's stock was already reversed at cancel-time — restoring
  // it from the bin must not re-apply stock a second time.
  it("does not re-add stock when restoring a cancelled bill", async () => {
    const vendor = await testPrisma.vendor.create({
      data: { name: "Acme Supplies", address: "x", city: "x", state: "x", pincode: "110001" },
    });
    const user = await testPrisma.user.findFirstOrThrow();
    const product = await testPrisma.product.create({ data: { name: "Beaker", price: 100, stock: 20, minStock: 2 } });
    const bill = await testPrisma.purchaseBill.create({
      data: {
        billNumber: "PB-2026-0098", vendorId: vendor.id, subtotal: 500, taxAmount: 0, total: 500,
        status: "cancelled", createdByUserId: user.id, deletedAt: new Date(),
        items: { create: [{ productId: product.id, name: "Beaker", hsn: "", quantity: 5, unit: "Nos", purchasePrice: 100, gstRate: 0, gstAmount: 0, total: 500 }] },
      },
    });

    const { POST } = await import("@/app/api/bin/[type]/[id]/route");
    const res = await POST(jsonRequest("http://localhost/api/bin/purchase_bill/x", "POST"), binParamsOf("purchase_bill", bill.id));
    expect(res.status).toBe(200);

    const afterRestore = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterRestore?.stock).toBe(20);
  });
});
