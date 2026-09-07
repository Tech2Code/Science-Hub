import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeInvoice(userId: string, overrides: Partial<{ total: number }> = {}) {
  const customer = await testPrisma.customer.create({
    data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
  });
  const total = overrides.total ?? 1000;
  return testPrisma.invoice.create({
    data: {
      invoiceNumber: `SH-TEST-${Math.random().toString(36).slice(2)}`,
      customerId: customer.id,
      userId,
      placeOfSupply: "Delhi",
      subtotal: total,
      total,
    },
  });
}

// Covers the idempotency-key contract POST /api/invoices/[id]/payment is supposed to guarantee:
// a retried key for the SAME invoice is a no-op (never double-records), while a key already used
// by a DIFFERENT invoice's payment is rejected outright rather than silently misattributed.
describe.skipIf(!hasTestDatabase)("POST /api/invoices/[id]/payment idempotencyKey", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    userId = user.id;
    mockSession({ id: user.id, role: "staff" });
  });

  it("records the payment once and returns the same invoice on a retried key", async () => {
    const invoice = await makeInvoice(userId);
    const { POST } = await import("@/app/api/invoices/[id]/payment/route");
    const key = "idem-payment-key-1";

    const first = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment`, "POST", { amount: 400, idempotencyKey: key }),
      paramsOf(invoice.id)
    );
    expect(first.status).toBe(201);

    const second = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment`, "POST", { amount: 400, idempotencyKey: key }),
      paramsOf(invoice.id)
    );
    expect(second.status).toBe(200);

    const updated = await testPrisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paidAmount).toBe(400);
    const paymentCount = await testPrisma.payment.count({ where: { invoiceId: invoice.id } });
    expect(paymentCount).toBe(1);
  });

  it("409s when the key was already used by a different invoice's payment, without touching the second invoice", async () => {
    const invoiceA = await makeInvoice(userId);
    const invoiceB = await makeInvoice(userId);
    const { POST } = await import("@/app/api/invoices/[id]/payment/route");
    const key = "idem-payment-key-shared";

    const first = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoiceA.id}/payment`, "POST", { amount: 200, idempotencyKey: key }),
      paramsOf(invoiceA.id)
    );
    expect(first.status).toBe(201);

    const second = await POST(
      jsonRequest(`http://localhost/api/invoices/${invoiceB.id}/payment`, "POST", { amount: 200, idempotencyKey: key }),
      paramsOf(invoiceB.id)
    );
    expect(second.status).toBe(409);

    const untouchedB = await testPrisma.invoice.findUnique({ where: { id: invoiceB.id } });
    expect(untouchedB?.paidAmount).toBe(0);
    const paymentCountB = await testPrisma.payment.count({ where: { invoiceId: invoiceB.id } });
    expect(paymentCountB).toBe(0);
  });

  it("never double-records under a genuine concurrent race on the same key", async () => {
    const invoice = await makeInvoice(userId);
    const { POST } = await import("@/app/api/invoices/[id]/payment/route");
    const key = "idem-payment-key-race";

    const [res1, res2] = await Promise.all([
      POST(jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment`, "POST", { amount: 300, idempotencyKey: key }), paramsOf(invoice.id)),
      POST(jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment`, "POST", { amount: 300, idempotencyKey: key }), paramsOf(invoice.id)),
    ]);

    // Neither concurrent request should ever surface as a server error, and — regardless of
    // which one "won" — the invoice must end up with exactly one payment recorded, never two.
    expect([res1.status, res2.status].every((s) => s === 200 || s === 201)).toBe(true);

    const updated = await testPrisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.paidAmount).toBe(300);
    const paymentCount = await testPrisma.payment.count({ where: { invoiceId: invoice.id } });
    expect(paymentCount).toBe(1);
  });
});

// Regression coverage for the gap the user reported: once a payment was recorded there was no
// way to correct a mistake (wrong amount/method/date) or remove a duplicate/misattributed entry.
describe.skipIf(!hasTestDatabase)("PUT/DELETE /api/invoices/[id]/payment/[paymentId]", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    userId = user.id;
    mockSession({ id: user.id, role: "staff" });
  });

  it("edits amount/method/reference and recomputes paidAmount/status", async () => {
    const invoice = await makeInvoice(userId, { total: 1000 });
    const payment = await testPrisma.payment.create({ data: { invoiceId: invoice.id, amount: 400, method: "Cash", date: new Date() } });
    await testPrisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 400, status: "partial" } });

    const { PUT } = await import("@/app/api/invoices/[id]/payment/[paymentId]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment/${payment.id}`, "PUT", { amount: 1000, method: "UPI", reference: "utr-1" }),
      paramsOf(invoice.id, { paymentId: payment.id })
    );
    expect(res.status).toBe(200);

    const updatedPayment = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(updatedPayment?.amount).toBe(1000);
    expect(updatedPayment?.method).toBe("UPI");
    const updatedInvoice = await testPrisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice?.paidAmount).toBe(1000);
    expect(updatedInvoice?.status).toBe("paid");
  });

  it("rejects an edit that would exceed the invoice total", async () => {
    const invoice = await makeInvoice(userId, { total: 1000 });
    const payment = await testPrisma.payment.create({ data: { invoiceId: invoice.id, amount: 400, method: "Cash", date: new Date() } });
    await testPrisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 400, status: "partial" } });

    const { PUT } = await import("@/app/api/invoices/[id]/payment/[paymentId]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment/${payment.id}`, "PUT", { amount: 1500 }),
      paramsOf(invoice.id, { paymentId: payment.id })
    );
    expect(res.status).toBe(400);
    const unchanged = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(unchanged?.amount).toBe(400);
  });

  it("deletes a payment and recomputes paidAmount/status back down", async () => {
    const invoice = await makeInvoice(userId, { total: 1000 });
    const payment = await testPrisma.payment.create({ data: { invoiceId: invoice.id, amount: 400, method: "Cash", date: new Date() } });
    await testPrisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 400, status: "partial" } });

    const { DELETE } = await import("@/app/api/invoices/[id]/payment/[paymentId]/route");
    const res = await DELETE(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment/${payment.id}`, "DELETE"),
      paramsOf(invoice.id, { paymentId: payment.id })
    );
    expect(res.status).toBe(200);

    const updatedInvoice = await testPrisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice?.paidAmount).toBe(0);
    expect(updatedInvoice?.status).toBe("unpaid");
    const remaining = await testPrisma.payment.count({ where: { invoiceId: invoice.id } });
    expect(remaining).toBe(0);
  });

  // The real data-integrity risk this feature introduces: a credit note is capped at creation
  // time against the invoice's paidAmount as it stood then (see returns/route.ts), not by a
  // standing DB constraint — so reducing/deleting a payment afterward could otherwise leave the
  // invoice claiming to have refunded more cash than it ever actually received.
  it("blocks reducing a payment below an already-issued credit note's total", async () => {
    const invoice = await makeInvoice(userId, { total: 1000 });
    const payment = await testPrisma.payment.create({ data: { invoiceId: invoice.id, amount: 1000, method: "Cash", date: new Date() } });
    await testPrisma.invoice.update({ where: { id: invoice.id }, data: { paidAmount: 1000, status: "paid" } });
    await testPrisma.return.create({
      data: { invoiceId: invoice.id, date: new Date(), subtotal: 600, cgst: 0, sgst: 0, igst: 0, total: 600 },
    });

    const { PUT } = await import("@/app/api/invoices/[id]/payment/[paymentId]/route");
    const editRes = await PUT(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment/${payment.id}`, "PUT", { amount: 500 }),
      paramsOf(invoice.id, { paymentId: payment.id })
    );
    expect(editRes.status).toBe(400);
    const editErr = await editRes.json();
    expect(editErr.error).toMatch(/credit note/i);

    const { DELETE } = await import("@/app/api/invoices/[id]/payment/[paymentId]/route");
    const deleteRes = await DELETE(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/payment/${payment.id}`, "DELETE"),
      paramsOf(invoice.id, { paymentId: payment.id })
    );
    expect(deleteRes.status).toBe(400);
    const deleteErr = await deleteRes.json();
    expect(deleteErr.error).toMatch(/credit note/i);

    const unchanged = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(unchanged?.amount).toBe(1000);
  });
});
