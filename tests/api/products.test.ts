import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { mockSession } from "../helpers/auth";
import { jsonRequest, paramsOf } from "../helpers/request";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

const baseBody = { name: "Beaker 250ml", price: "100", purchasePrice: "80", listPrice: "100", unit: "Nos", stock: "10", minStock: "2" };

describe.skipIf(!hasTestDatabase)("POST /api/products", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  it("creates a product without discountPercent (backward compat for the pre-existing form shape)", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", baseBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.listPrice).toBe(100);
    expect(data.discountPercent).toBe(0);
  });

  it("rejects a request with no listPrice (now mandatory)", async () => {
    const { name, price, purchasePrice, unit, stock, minStock } = baseBody;
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", { name, price, purchasePrice, unit, stock, minStock }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/list price/i);
  });

  it("persists listPrice/discountPercent when supplied", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, listPrice: "100", discountPercent: "10", purchasePrice: "90",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.listPrice).toBe(100);
    expect(data.discountPercent).toBe(10);
    expect(data.purchasePrice).toBe(90);
  });

  it("rejects a discountPercent over 100", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, discountPercent: "150",
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/discountPercent/i);
  });

  it("rejects a negative discountPercent", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, discountPercent: "-5",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a negative listPrice", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, listPrice: "-1",
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/listPrice/i);
  });

  // "Infinity" parses as a valid JS number, so a bare `>= 0` check (with no upper bound) would let
  // it through and corrupt every downstream sum (total, balanceDue, GST reports) with Infinity/NaN.
  it("rejects an Infinity price/purchasePrice/listPrice instead of silently accepting it", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, listPrice: "Infinity",
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/listPrice/i);
  });

  it("rejects a gstRate over 100 even though the client UI would normally prevent it", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", {
      ...baseBody, gstRate: "150",
    }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/gstRate/i);
  });

  it("rejects a request with no purchasePrice (now mandatory)", async () => {
    const { name, price, listPrice, unit, stock, minStock } = baseBody;
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", { name, price, listPrice, unit, stock, minStock }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/purchase price/i);
  });

  it("rejects a blank purchasePrice", async () => {
    const { POST } = await import("@/app/api/products/route");
    const res = await POST(jsonRequest("http://localhost/api/products", "POST", { ...baseBody, purchasePrice: "" }));
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/purchase price/i);
  });
});

describe.skipIf(!hasTestDatabase)("PUT /api/products/[id]", () => {
  beforeEach(async () => {
    await resetDb();
    const user = await seedUser();
    mockSession({ id: user.id, role: "staff" });
  });

  async function makeProduct() {
    return testPrisma.product.create({ data: { name: "Beaker", price: 100, listPrice: 100, stock: 10, minStock: 2 } });
  }

  it("rejects a discountPercent over 100 on edit", async () => {
    const product = await makeProduct();
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { discountPercent: "150" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects a negative listPrice on edit", async () => {
    const product = await makeProduct();
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { listPrice: "-1" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects clearing listPrice to an empty string (now mandatory)", async () => {
    const product = await testPrisma.product.create({
      data: { name: "Beaker", price: 100, stock: 10, minStock: 2, listPrice: 100, discountPercent: 10 },
    });
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { listPrice: "" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/list price/i);
  });

  it("persists an updated listPrice/discountPercent pair", async () => {
    const product = await makeProduct();
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { listPrice: "200", discountPercent: "20" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.listPrice).toBe(200);
    expect(data.discountPercent).toBe(20);
  });

  it("rejects a gstRate over 100 on edit", async () => {
    const product = await makeProduct();
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { gstRate: "150" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(400);
  });

  it("rejects clearing purchasePrice to an empty string (now mandatory)", async () => {
    const product = await testPrisma.product.create({ data: { name: "Beaker", price: 100, listPrice: 100, purchasePrice: 80, stock: 10, minStock: 2 } });
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { purchasePrice: "" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error).toMatch(/purchase price/i);
  });

  it("persists an updated purchasePrice", async () => {
    const product = await testPrisma.product.create({ data: { name: "Beaker", price: 100, listPrice: 100, purchasePrice: 80, stock: 10, minStock: 2 } });
    const { PUT } = await import("@/app/api/products/[id]/route");
    const res = await PUT(
      jsonRequest(`http://localhost/api/products/${product.id}`, "PUT", { purchasePrice: "95" }),
      paramsOf(product.id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.purchasePrice).toBe(95);
  });
});
