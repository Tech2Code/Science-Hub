-- Performance indexes (hand-written to match schema.prisma; index names follow Prisma's own
-- "<Model>_<columns>_idx" convention so `prisma migrate diff` sees no drift).
--   - Invoice/PurchaseBill createdAt: every list's "newest"/"oldest" sort is by createdAt.
--   - Invoice/PurchaseBill dueDate: overdue filters/counts (dashboard, list tabs, notifications).
--   - ActivityLog (entityType, action): bin/credit-note creator lookups filtered by entity type.
--   - InvoiceItem/PurchaseBillItem name trigram: global search + list search match line-item names
--     with ILIKE '%q%', which a btree can't serve.
-- pg_trgm is already enabled by 20260818120000_add_search_trigram_indexes. Plain CREATE INDEX (not
-- CONCURRENTLY) for the same reason documented there — Prisma Migrate wraps each migration in a
-- transaction.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseBill_createdAt_idx" ON "PurchaseBill"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseBill_dueDate_idx" ON "PurchaseBill"("dueDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActivityLog_entityType_action_idx" ON "ActivityLog"("entityType", "action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvoiceItem_name_idx" ON "InvoiceItem" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseBillItem_name_idx" ON "PurchaseBillItem" USING GIN ("name" gin_trgm_ops);
