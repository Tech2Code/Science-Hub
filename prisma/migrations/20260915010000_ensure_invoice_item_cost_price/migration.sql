-- AlterTable
-- Some environments (e.g. dev) already had this column from a since-superseded local migration;
-- others (production) never did. IF NOT EXISTS makes this migration a safe no-op on the former and
-- the real fix on the latter, so both environments converge to the same schema.
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION;
