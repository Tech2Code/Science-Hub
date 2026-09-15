-- AlterTable
-- Mirrors InvoiceItem.costSource so a return line's cost can be classified real ("ledger"/
-- "custom-provided") vs assumed ("fallback"/"custom") — powers the dashboard's Verified Profit.
ALTER TABLE "ReturnItem" ADD COLUMN     "costSource" TEXT;
