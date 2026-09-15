-- AlterTable
-- costPrice already exists (added by a since-superseded local migration). Only costSource is new:
-- "ledger" = real weighted-average cost from purchase history. "fallback" = no stock available at
-- sale time, Product.purchasePrice used as a placeholder until a later purchase supplies real
-- history (recompute then upgrades it to "ledger" automatically). Null on legacy rows.
ALTER TABLE "InvoiceItem" ADD COLUMN     "costSource" TEXT;
