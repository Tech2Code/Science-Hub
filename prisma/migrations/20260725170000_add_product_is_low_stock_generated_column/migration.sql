-- AlterTable
-- Reconciles the schema's non-nullable dbgenerated() declaration with the
-- actual GENERATED ALWAYS AS columns added in the earlier migration (always
-- computed for every row, so this is safe).
ALTER TABLE "Invoice" ALTER COLUMN "balanceDue" SET NOT NULL;

-- AlterTable
-- Postgres GENERATED column, not a plain DEFAULT (a DEFAULT expression can't
-- reference sibling columns) — mirrors src/lib/stockStatus.ts's isLowStock().
ALTER TABLE "Product" ADD COLUMN     "isLowStock" BOOLEAN GENERATED ALWAYS AS ("stock" > 0 AND "stock" <= "minStock") STORED;

-- AlterTable
ALTER TABLE "PurchaseBill" ALTER COLUMN "balanceDue" SET NOT NULL;
