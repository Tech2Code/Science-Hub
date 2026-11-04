"use client";
import { bustCachePrefix } from "./useCache";
import { invalidateCachedPdf } from "./pdfCache";

/**
 * The single place that answers "after THIS mutation, which cached screens and PDFs are stale?".
 *
 * Detail pages used to hand-write 5-7 bustCachePrefix()/invalidateCachedPdf() calls per handler, so
 * forgetting one silently left a list/dashboard/PDF showing old data. Each event below lists exactly
 * what that mutation touches; a handler now makes one call: `invalidateAfter({ type, ... })`.
 *
 * `bustCachePrefix("/api/x")` also drops "/api/x?...", and "/api/x/..." (stats, detail, sub-routes), so a
 * per-id `bustCache("/api/invoices/<id>")` next to `bustCachePrefix("/api/invoices")` is redundant.
 */
export type CacheEvent =
  // An invoice payment was recorded / edited / deleted.
  | { type: "invoice-payment-changed"; invoiceId: string }
  // A credit note (return) was recorded or deleted against an invoice. `returnId` is the deleted note.
  | { type: "invoice-return-changed"; invoiceId: string; returnId?: string }
  // Admin changed who is recorded as the invoice's creator.
  | { type: "invoice-reassigned" }
  // Invoice moved to the Recycle Bin.
  | { type: "invoice-deleted"; invoiceId: string }
  // A purchase-bill payment was recorded / edited / deleted.
  | { type: "bill-payment-changed"; billId: string }
  // A purchase bill was cancelled / un-cancelled / moved to the bin — each changes product stock.
  | { type: "bill-stock-changed"; billId: string }
  // Admin changed who is recorded as the purchase bill's creator.
  | { type: "bill-reassigned" };

const INVOICE_PAYMENT_PREFIXES = [
  "/api/invoices",
  "/api/payments",
  "/api/reports",
  "/api/customers", // customer detail's invoice sub-table / statement
  "/api/notifications", // overdue/due-invoice alerts depend on paid status
];

const INVOICE_RETURN_PREFIXES = [
  "/api/invoices",
  "/api/products", // a return restores stock
  "/api/credit-notes",
  "/api/reports",
  "/api/customers", // customer statement lists credit notes
];

const INVOICE_DELETE_PREFIXES = [
  "/api/invoices",
  "/api/products",
  "/api/reports",
  "/api/payments", // Payments Received filters out payments whose invoice is deleted
  "/api/customers", // customer list's invoice counts / outstanding figures
  "/api/notifications",
];

const BILL_PAYMENT_PREFIXES = [
  "/api/purchase-bills",
  "/api/reports",
  "/api/purchase-reports",
  "/api/vendors", // vendor detail's bill history / Paid / Balance
  "/api/notifications", // overdue-bills bell count
];

const BILL_STOCK_PREFIXES = [
  "/api/purchase-bills",
  "/api/products",
  "/api/reports",
  "/api/purchase-reports",
  "/api/vendors",
  "/api/notifications",
];

function bust(prefixes: readonly string[]): void {
  for (const prefix of prefixes) bustCachePrefix(prefix);
}

export function invalidateAfter(event: CacheEvent): void {
  switch (event.type) {
    case "invoice-payment-changed":
      void invalidateCachedPdf("invoice", event.invoiceId);
      bust(INVOICE_PAYMENT_PREFIXES);
      return;
    case "invoice-return-changed":
      if (event.returnId) void invalidateCachedPdf("return", event.returnId);
      void invalidateCachedPdf("invoice", event.invoiceId);
      bust(INVOICE_RETURN_PREFIXES);
      return;
    case "invoice-reassigned":
      bust(["/api/invoices"]);
      return;
    case "invoice-deleted":
      void invalidateCachedPdf("invoice", event.invoiceId);
      bust(INVOICE_DELETE_PREFIXES);
      return;
    case "bill-payment-changed":
      void invalidateCachedPdf("purchase-bill", event.billId);
      bust(BILL_PAYMENT_PREFIXES);
      return;
    case "bill-stock-changed":
      void invalidateCachedPdf("purchase-bill", event.billId);
      bust(BILL_STOCK_PREFIXES);
      return;
    case "bill-reassigned":
      bust(["/api/purchase-bills"]);
      return;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
