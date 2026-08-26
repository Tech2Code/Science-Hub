-- Same reasoning as the 20260826130000 migration — a client-generated idempotency key on
-- Return (credit note) creation, so a retried/duplicated POST can't consume a second
-- credit-note number or double-restore stock for the same submission.
ALTER TABLE "Return" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Return_idempotencyKey_key" ON "Return"("idempotencyKey");
