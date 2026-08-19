-- Vendor and PurchaseBill were the only two soft-deletable models missing a
-- `deletedAt` index (every other one — Customer, Category, Brand, Product,
-- Invoice, Return, RateList — already has this), despite every list/stats
-- query (vendorQuery.ts, purchaseBillQuery.ts) filtering `deletedAt: null`
-- first. Without it, that filter forces a full table scan on every vendor
-- or purchase-bill list/bin/dashboard query as the table grows.
CREATE INDEX IF NOT EXISTS "Vendor_deletedAt_idx" ON "Vendor"("deletedAt");
CREATE INDEX IF NOT EXISTS "PurchaseBill_deletedAt_idx" ON "PurchaseBill"("deletedAt");
