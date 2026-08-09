import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeCustomer() {
  return testPrisma.customer.create({
    data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
  });
}

async function makeProduct(overrides: Partial<{ stock: number }> = {}) {
  return testPrisma.product.create({
    data: { name: "Beaker", price: 100, stock: overrides.stock ?? 100, minStock: 2 },
  });
}

// Creates an invoice with a single line item directly via Prisma (bypassing
// the invoice-create route, which isn't under test here) with a specified
// quantity/price/gstRate/paidAmount, so the return route's own math and
// guard-rails are what's actually exercised.
async function makeInvoice(opts: {
  productId: string; quantity: number; price: number; gstRate: number; paidAmount: number;
}) {
  const customer = await makeCustomer();
  const user = await testPrisma.user.findFirstOrThrow();
  const gross = opts.quantity * opts.price;
  const gstAmount = (gross * opts.gstRate) / 100;
  const total = gross + gstAmount;
  const invoice = await testPrisma.invoice.create({
    data: {
      invoiceNumber: `SH-2026-${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`,
      customerId: customer.id,
      userId: user.id,
      subtotal: gross,
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      igst: 0,
      total,
      paidAmount: opts.paidAmount,
      status: opts.paidAmount >= total ? "paid" : opts.paidAmount > 0 ? "partial" : "unpaid",
      isInterState: false,
      placeOfSupply: "Delhi",
      items: {
        create: [{
          productId: opts.productId, name: "Beaker", hsn: "", quantity: opts.quantity, unit: "Nos",
          price: opts.price, gstRate: opts.gstRate, gstAmount, total: opts.price * opts.quantity + gstAmount,
        }],
      },
    },
  });
  return invoice;
}

describe.skipIf(!hasTestDatabase)("POST /api/invoices/[id]/returns", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("caps a return by the invoice's paidAmount minus already-returned value", async () => {
    const product = await makeProduct();
    // total 10000, paid 6000, GST-free for simplicity so return value == qty*price
    const invoice = await makeInvoice({ productId: product.id, quantity: 100, price: 100, gstRate: 0, paidAmount: 6000 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");

    // First return of 6000 (60 units @ 100) exactly exhausts the available amount.
    const res1 = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 60, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res1.status).toBe(201);
    const firstReturn = await res1.json();
    expect(firstReturn.total).toBe(6000);

    // A second return of any further value must be rejected — nothing left
    // to return against (6000 paid, 6000 already returned).
    const res2 = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 1, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res2.status).toBe(400);
    const err = await res2.json();
    expect(err.error).toMatch(/exceeds available paid amount/i);
  });

  it("caps a return's quantity by the remaining returnable quantity per product", async () => {
    const product = await makeProduct();
    // paidAmount is set well above the invoice total (not realistic in normal
    // use, but the route only ever reads it as a ceiling) specifically so the
    // paid-amount cap can never be the reason a second return is rejected —
    // isolating the quantity-cap check this test actually targets.
    const invoice = await makeInvoice({ productId: product.id, quantity: 10, price: 100, gstRate: 0, paidAmount: 5000 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");

    // Returning all 10 units succeeds.
    const res1 = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 10, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res1.status).toBe(201);

    // Nothing is left to return for this product — even a 1-unit return must fail.
    const res2 = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 1, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res2.status).toBe(400);
    const err = await res2.json();
    expect(err.error).toMatch(/remain returnable/i);
  });

  it("computes GST on the return proportional to the returned quantity, not the full line", async () => {
    const product = await makeProduct();
    // Full line: 10 units @ 100 with 18% GST => subtotal 1000, GST 180, total 1180.
    const invoice = await makeInvoice({ productId: product.id, quantity: 10, price: 100, gstRate: 18, paidAmount: 1180 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");
    // Return only 4 of the 10 units.
    const res = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 4, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    // 4 * 100 = 400 taxable, 18% of 400 = 72 GST, total 472 — not the full line's 180/1180.
    expect(data.subtotal).toBe(400);
    expect(data.cgst + data.sgst + data.igst).toBe(72);
    expect(data.total).toBe(472);
  });

  it("restores stock when a return is created", async () => {
    const product = await makeProduct({ stock: 50 });
    const invoice = await makeInvoice({ productId: product.id, quantity: 10, price: 100, gstRate: 0, paidAmount: 1000 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 3, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res.status).toBe(201);

    const updatedProduct = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct?.stock).toBe(53);
  });

  it("rejects a return on an invoice with no payment received yet", async () => {
    const product = await makeProduct();
    const invoice = await makeInvoice({ productId: product.id, quantity: 10, price: 100, gstRate: 0, paidAmount: 0 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");
    const res = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 1, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hasTestDatabase)("DELETE /api/invoices/[id]/returns/[returnId]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("reverses the restored stock on delete and is double-delete safe", async () => {
    const product = await makeProduct({ stock: 50 });
    const invoice = await makeInvoice({ productId: product.id, quantity: 10, price: 100, gstRate: 0, paidAmount: 1000 });

    const { POST } = await import("@/app/api/invoices/[id]/returns/route");
    const createRes = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ productId: product.id, name: "Beaker", quantity: 3, price: 100 }],
      }),
      paramsOf(invoice.id)
    );
    const created = await createRes.json();
    // Stock is now 53 (50 + 3 restored).

    const { DELETE } = await import("@/app/api/invoices/[id]/returns/[returnId]/route");
    const del1 = await DELETE(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns/${created.id}`, "DELETE"),
      { params: Promise.resolve({ id: invoice.id, returnId: created.id }) }
    );
    expect(del1.status).toBe(200);

    const afterFirstDelete = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterFirstDelete?.stock).toBe(50);

    // Deleting the same credit note again must not reverse stock a second time.
    const del2 = await DELETE(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns/${created.id}`, "DELETE"),
      { params: Promise.resolve({ id: invoice.id, returnId: created.id }) }
    );
    expect(del2.status).toBe(200);
    const msg2 = await del2.json();
    expect(msg2.message).toMatch(/already/i);

    const afterSecondDelete = await testPrisma.product.findUnique({ where: { id: product.id } });
    expect(afterSecondDelete?.stock).toBe(50);
  });
});
