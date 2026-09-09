import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession, mockNoSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

async function makeCustomer() {
  return testPrisma.customer.create({
    data: { name: "Test Customer", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
  });
}

const baseItem = { name: "Widget", qty: 1, price: 100, gstRate: 18, unit: "Nos", hsn: "", discountPercent: 0 };

describe.skipIf(!hasTestDatabase)("GET /api/invoices/next-number", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("previews sequence 1 on an empty database with default numbering", async () => {
    const { GET } = await import("@/app/api/invoices/next-number/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documentNumber).toMatch(/^SH-\d{4}-\d{2}-0001$/);
  });

  it("previews the next sequence after an invoice exists, and is a read with no side effect", async () => {
    const customer = await makeCustomer();
    const { POST } = await import("@/app/api/invoices/route");
    await POST(jsonRequest("http://localhost/api/invoices", "POST", {
      customerId: customer.id, placeOfSupply: "Delhi", items: [baseItem],
    }));

    const { GET } = await import("@/app/api/invoices/next-number/route");
    const res1 = await GET();
    const data1 = await res1.json();
    expect(data1.documentNumber).toMatch(/^SH-\d{4}-\d{2}-0002$/);

    // Calling the preview again returns the exact same value — it must never
    // consume the sequence the way an actual create does.
    const res2 = await GET();
    const data2 = await res2.json();
    expect(data2.documentNumber).toBe(data1.documentNumber);
  });

  it("requires a session", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/invoices/next-number/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)("GET /api/purchase-bills/next-number", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("previews sequence 1 on an empty database with default numbering", async () => {
    const { GET } = await import("@/app/api/purchase-bills/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/purchase-bills/next-number", "GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documentNumber).toMatch(/^PB-\d{4}-\d{2}-0001$/);
  });

  // The bill's FY segment is derived from billDate (a bill can be entered
  // late for an earlier period), not "now" — a billDate a year apart from
  // today's must land in a different FY bucket, still at sequence 1.
  it("derives the FY segment from the given billDate, not today", async () => {
    const { GET } = await import("@/app/api/purchase-bills/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/purchase-bills/next-number?billDate=2020-05-15", "GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documentNumber).toBe("PB-2020-21-0001");
  });

  it("rejects an invalid billDate", async () => {
    const { GET } = await import("@/app/api/purchase-bills/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/purchase-bills/next-number?billDate=not-a-date", "GET"));
    expect(res.status).toBe(400);
  });

  it("requires a session", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/purchase-bills/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/purchase-bills/next-number", "GET"));
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasTestDatabase)("GET /api/credit-notes/next-number", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("previews sequence 1 on an empty database with default numbering", async () => {
    const { GET } = await import("@/app/api/credit-notes/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/credit-notes/next-number", "GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documentNumber).toMatch(/^CN-\d{4}-\d{2}-0001$/);
  });

  it("previews the next sequence after a credit note exists", async () => {
    const customer = await makeCustomer();
    const user = await testPrisma.user.findFirstOrThrow();
    const invoice = await testPrisma.invoice.create({
      data: {
        invoiceNumber: "SH-2026-27-9999",
        customerId: customer.id,
        userId: user.id,
        subtotal: 10000, cgst: 0, sgst: 0, igst: 0, total: 10000, paidAmount: 10000, status: "paid",
        isInterState: false, placeOfSupply: "Delhi",
        items: { create: [{ name: "Beaker", hsn: "", quantity: 10, unit: "Nos", price: 1000, gstRate: 0, gstAmount: 0, total: 10000 }] },
      },
    });

    const { POST: postReturn } = await import("@/app/api/invoices/[id]/returns/route");
    const createRes = await postReturn(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}/returns`, "POST", {
        items: [{ name: "Beaker", quantity: 1, price: 1000 }],
      }),
      paramsOf(invoice.id)
    );
    expect(createRes.status).toBe(201);

    const { GET } = await import("@/app/api/credit-notes/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/credit-notes/next-number", "GET"));
    const data = await res.json();
    expect(data.documentNumber).toMatch(/^CN-\d{4}-\d{2}-0002$/);
  });

  it("requires a session", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/credit-notes/next-number/route");
    const res = await GET(jsonRequest("http://localhost/api/credit-notes/next-number", "GET"));
    expect(res.status).toBe(401);
  });
});
