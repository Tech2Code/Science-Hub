-- AlterTable
-- Removes the weighted-average-cost (WAC) costing columns added by the now-reverted "Actual Profit"
-- feature (InvoiceItem.costPrice/costSource, ReturnItem.costPrice/costSource/sourceInvoiceItemId) —
-- the feature's cost calculation was found to be unreliable (a documented oversell scenario
-- silently corrupted the running weighted average and mislabeled it as verified) and was removed.
ALTER TABLE "InvoiceItem" DROP COLUMN "costPrice";
ALTER TABLE "InvoiceItem" DROP COLUMN "costSource";
ALTER TABLE "ReturnItem" DROP COLUMN "costPrice";
ALTER TABLE "ReturnItem" DROP COLUMN "costSource";
ALTER TABLE "ReturnItem" DROP COLUMN "sourceInvoiceItemId";
