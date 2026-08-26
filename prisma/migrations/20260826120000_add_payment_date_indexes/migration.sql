-- Payment, PurchasePayment, and Return were all missing an index on `date`, despite
-- paymentQuery.ts / purchasePaymentQuery.ts / creditNoteQuery.ts defaulting every list/stats
-- query to `ORDER BY date DESC` and filtering by dateRange when a month/year is supplied.
-- As these tables grow (every invoice/purchase-bill payment and every credit note inserts a
-- row), the default "newest first" view forces a full sequential scan + sort without this.
CREATE INDEX IF NOT EXISTS "Payment_date_idx" ON "Payment"("date");
CREATE INDEX IF NOT EXISTS "PurchasePayment_date_idx" ON "PurchasePayment"("date");
CREATE INDEX IF NOT EXISTS "Return_date_idx" ON "Return"("date");
