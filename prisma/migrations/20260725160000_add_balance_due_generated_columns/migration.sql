-- AlterTable
-- Postgres GENERATED column, not a plain DEFAULT (a DEFAULT expression can't
-- reference sibling columns) — stays in sync automatically whenever total/
-- paidAmount change, with no app-side write path to keep consistent.
ALTER TABLE "Invoice" ADD COLUMN     "balanceDue" DOUBLE PRECISION GENERATED ALWAYS AS ("total" - "paidAmount") STORED;

-- AlterTable
ALTER TABLE "PurchaseBill" ADD COLUMN     "balanceDue" DOUBLE PRECISION GENERATED ALWAYS AS ("total" - "paidAmount") STORED;
