-- Reverses a migration that was applied directly to this database from a
-- parked, never-merged branch (feature/custom-invoice-bill-name) — its
-- "customName" columns are not in this codebase's schema.prisma and nothing
-- here reads/writes them. Dropping them brings the live DB back in sync
-- with what schema.prisma has always declared. User confirmed 2026-08-18,
-- aware that Invoice.customName had exactly one non-null row that is lost.
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "customName";
ALTER TABLE "PurchaseBill" DROP COLUMN IF EXISTS "customName";
