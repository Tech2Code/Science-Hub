import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pdfCache", () => ({ invalidateCachedPdf: vi.fn(async () => {}) }));

import { invalidateAfter, type CacheEvent } from "@/lib/cacheInvalidation";
import { invalidateCachedPdf } from "@/lib/pdfCache";
import { patchCache, isCached } from "@/lib/useCache";

// One representative cached URL per endpoint family, including a parameterized list URL and a
// "/stats" sibling — the exact shapes bustCachePrefix() must drop while leaving unrelated screens alone.
const ALL_URLS = [
  "/api/invoices?page=1&pageSize=20",
  "/api/invoices/stats?status=unpaid",
  "/api/invoices/inv1",
  "/api/payments?page=1",
  "/api/reports?type=summary",
  "/api/customers?page=1",
  "/api/customers/c1",
  "/api/notifications",
  "/api/products?page=1",
  "/api/credit-notes?page=1",
  "/api/purchase-bills?page=1",
  "/api/purchase-bills/payments?page=1",
  "/api/purchase-bills/b1",
  "/api/purchase-reports?type=summary",
  "/api/vendors/v1",
  "/api/brands?page=1", // never touched by any event below
  "/api/settings", // never touched by any event below
];

function seed() {
  for (const url of ALL_URLS) patchCache(url, () => ({ url }));
}

function bustedUrls(): string[] {
  return ALL_URLS.filter((u) => !isCached(u));
}

function expectBusted(event: CacheEvent, expectedBusted: string[]) {
  seed();
  invalidateAfter(event);
  expect(bustedUrls().sort()).toEqual([...expectedBusted].sort());
}

const INVOICE_FAMILY = ["/api/invoices?page=1&pageSize=20", "/api/invoices/stats?status=unpaid", "/api/invoices/inv1"];
const BILL_FAMILY = ["/api/purchase-bills?page=1", "/api/purchase-bills/payments?page=1", "/api/purchase-bills/b1"];

describe("invalidateAfter", () => {
  beforeEach(() => {
    vi.mocked(invalidateCachedPdf).mockClear();
  });

  it("invoice-payment-changed busts invoices, payments, reports, customers, notifications — not products/credit-notes", () => {
    expectBusted({ type: "invoice-payment-changed", invoiceId: "inv1" }, [
      ...INVOICE_FAMILY,
      "/api/payments?page=1",
      "/api/reports?type=summary",
      "/api/customers?page=1",
      "/api/customers/c1",
      "/api/notifications",
    ]);
    expect(invalidateCachedPdf).toHaveBeenCalledTimes(1);
    expect(invalidateCachedPdf).toHaveBeenCalledWith("invoice", "inv1");
  });

  it("invoice-return-changed busts invoices, products, credit-notes, reports, customers — not payments/notifications", () => {
    expectBusted({ type: "invoice-return-changed", invoiceId: "inv1" }, [
      ...INVOICE_FAMILY,
      "/api/products?page=1",
      "/api/credit-notes?page=1",
      "/api/reports?type=summary",
      "/api/customers?page=1",
      "/api/customers/c1",
    ]);
    expect(invalidateCachedPdf).toHaveBeenCalledTimes(1);
    expect(invalidateCachedPdf).toHaveBeenCalledWith("invoice", "inv1");
  });

  it("invoice-return-changed with a returnId also drops that credit note's cached PDF", () => {
    seed();
    invalidateAfter({ type: "invoice-return-changed", invoiceId: "inv1", returnId: "ret9" });
    expect(invalidateCachedPdf).toHaveBeenCalledWith("return", "ret9");
    expect(invalidateCachedPdf).toHaveBeenCalledWith("invoice", "inv1");
    expect(invalidateCachedPdf).toHaveBeenCalledTimes(2);
  });

  it("invoice-reassigned only busts the invoice family and no PDF", () => {
    expectBusted({ type: "invoice-reassigned" }, INVOICE_FAMILY);
    expect(invalidateCachedPdf).not.toHaveBeenCalled();
  });

  it("invoice-deleted busts invoices, products, reports, payments, customers, notifications", () => {
    expectBusted({ type: "invoice-deleted", invoiceId: "inv1" }, [
      ...INVOICE_FAMILY,
      "/api/products?page=1",
      "/api/reports?type=summary",
      "/api/payments?page=1",
      "/api/customers?page=1",
      "/api/customers/c1",
      "/api/notifications",
    ]);
    expect(invalidateCachedPdf).toHaveBeenCalledWith("invoice", "inv1");
  });

  it("bill-payment-changed busts bills, reports, purchase-reports, vendors, notifications — not products", () => {
    expectBusted({ type: "bill-payment-changed", billId: "b1" }, [
      ...BILL_FAMILY,
      "/api/reports?type=summary",
      "/api/purchase-reports?type=summary",
      "/api/vendors/v1",
      "/api/notifications",
    ]);
    expect(invalidateCachedPdf).toHaveBeenCalledTimes(1);
    expect(invalidateCachedPdf).toHaveBeenCalledWith("purchase-bill", "b1");
  });

  it("bill-stock-changed (cancel/uncancel/delete) additionally busts products", () => {
    expectBusted({ type: "bill-stock-changed", billId: "b1" }, [
      ...BILL_FAMILY,
      "/api/products?page=1",
      "/api/reports?type=summary",
      "/api/purchase-reports?type=summary",
      "/api/vendors/v1",
      "/api/notifications",
    ]);
    expect(invalidateCachedPdf).toHaveBeenCalledWith("purchase-bill", "b1");
  });

  it("bill-reassigned only busts the purchase-bill family and no PDF", () => {
    expectBusted({ type: "bill-reassigned" }, BILL_FAMILY);
    expect(invalidateCachedPdf).not.toHaveBeenCalled();
  });

  it("never touches unrelated cached screens (brands, settings) for any event", () => {
    const events: CacheEvent[] = [
      { type: "invoice-payment-changed", invoiceId: "i" },
      { type: "invoice-return-changed", invoiceId: "i" },
      { type: "invoice-reassigned" },
      { type: "invoice-deleted", invoiceId: "i" },
      { type: "bill-payment-changed", billId: "b" },
      { type: "bill-stock-changed", billId: "b" },
      { type: "bill-reassigned" },
    ];
    for (const event of events) {
      seed();
      invalidateAfter(event);
      expect(isCached("/api/brands?page=1")).toBe(true);
      expect(isCached("/api/settings")).toBe(true);
    }
  });
});
