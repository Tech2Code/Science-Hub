-- Reclassify historical "adjustment" rows into specific transaction types,
-- using the exact notes text each code path wrote before this migration —
-- these strings are deterministic 1:1 markers of which action created the row.
UPDATE "StockMovement" SET "type" = 'sale_edit_reverse'       WHERE "type" = 'adjustment' AND "notes" = 'Invoice edited — old items reversed';
UPDATE "StockMovement" SET "type" = 'sale_edit_apply'         WHERE "type" = 'adjustment' AND "notes" = 'Invoice edited — new items applied';
UPDATE "StockMovement" SET "type" = 'sale_delete_restore'     WHERE "type" = 'adjustment' AND "notes" = 'Invoice deleted';
UPDATE "StockMovement" SET "type" = 'sale_bin_restore'        WHERE "type" = 'adjustment' AND "notes" = 'Invoice restored from bin';
UPDATE "StockMovement" SET "type" = 'purchase_edit_reverse'   WHERE "type" = 'adjustment' AND "notes" = 'Purchase bill edited — old items reversed';
UPDATE "StockMovement" SET "type" = 'purchase_edit_apply'     WHERE "type" = 'adjustment' AND "notes" = 'Purchase bill edited — new items applied';
UPDATE "StockMovement" SET "type" = 'purchase_cancel'         WHERE "type" = 'adjustment' AND "notes" = 'Purchase bill cancelled';
UPDATE "StockMovement" SET "type" = 'purchase_uncancel'       WHERE "type" = 'adjustment' AND "notes" = 'Purchase bill un-cancelled';
UPDATE "StockMovement" SET "type" = 'purchase_delete_restore' WHERE "type" = 'adjustment' AND "notes" = 'Purchase bill deleted';
UPDATE "StockMovement" SET "type" = 'return_bin_restore'      WHERE "type" = 'adjustment' AND "notes" = 'Credit note restored from bin';
UPDATE "StockMovement" SET "type" = 'return_delete_reverse'   WHERE "type" = 'adjustment' AND "notes" = 'Credit note deleted';
-- Purchase-bin-restore previously reused the generic "purchase" type — split
-- it out from ordinary bill-creation rows using the same notes marker.
UPDATE "StockMovement" SET "type" = 'purchase_bin_restore'    WHERE "type" = 'purchase' AND "notes" = 'Purchase bill restored from bin';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT '';

-- Backfill documentType from the now-specific `type` values. Anything left
-- over (old "adjustment" rows whose notes didn't match a known marker) falls
-- back to 'manual' rather than a guess.
UPDATE "StockMovement" SET "documentType" = CASE
  WHEN "type" IN ('sale', 'sale_edit_reverse', 'sale_edit_apply', 'sale_delete_restore', 'sale_bin_restore') THEN 'invoice'
  WHEN "type" IN ('purchase', 'purchase_edit_reverse', 'purchase_edit_apply', 'purchase_cancel', 'purchase_uncancel', 'purchase_delete_restore', 'purchase_bin_restore') THEN 'purchase_bill'
  WHEN "type" IN ('return', 'return_delete_reverse', 'return_bin_restore') THEN 'credit_note'
  ELSE 'manual'
END;

-- CreateIndex
CREATE INDEX "StockMovement_documentType_idx" ON "StockMovement"("documentType");
