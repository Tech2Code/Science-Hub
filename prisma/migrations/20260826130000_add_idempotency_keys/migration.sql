-- Client-generated idempotency keys on the four money/document-mutating creates
-- (Invoice, PurchaseBill, Payment, PurchasePayment) so a retried or duplicated
-- POST (network timeout, double-tap) can't silently create a second row for the
-- same submission. Nullable + unique: existing rows and any caller that doesn't
-- send a key are unaffected; the unique constraint is what blocks the duplicate.
ALTER TABLE "Invoice" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PurchasePayment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");
CREATE UNIQUE INDEX "PurchaseBill_idempotencyKey_key" ON "PurchaseBill"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "PurchasePayment_idempotencyKey_key" ON "PurchasePayment"("idempotencyKey");
