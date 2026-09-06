-- List Price is now required on every product (previously optional). Backfill existing rows that
-- predate this pair (or came through bulk import, which never collected a List Price) with
-- listPrice = purchasePrice — i.e. assume 0% vendor discount when none was ever recorded, rather
-- than inventing a number. A handful of legacy rows have purchasePrice null too (predates that
-- column being required at the application layer) — fall back to Selling Price for those, the
-- one money field that's always non-null. Then lock the column NOT NULL.
UPDATE "Product" SET "listPrice" = COALESCE("purchasePrice", "price") WHERE "listPrice" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "listPrice" SET NOT NULL;
