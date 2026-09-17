-- CreateIndex
-- ActivityLog is queried by entityId (often filtered/combined with action) on every Bin page load
-- and every Credit Notes list load, with no supporting index — this table is append-only and never
-- purged for invoice/purchase_bill/return entity types, so it grows unbounded.
CREATE INDEX "ActivityLog_entityId_action_idx" ON "ActivityLog"("entityId", "action");
