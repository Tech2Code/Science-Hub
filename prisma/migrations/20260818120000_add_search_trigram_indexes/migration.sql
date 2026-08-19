-- Enables fuzzy/substring text matching so a `contains`/ILIKE '%q%' query
-- (used everywhere in /api/search) can use an index instead of a full table
-- scan. A plain btree index only helps exact or prefix matches.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CREATE INDEX CONCURRENTLY can't run inside Prisma Migrate's transaction
-- wrapper (errors with "cannot run inside a transaction block"), so this
-- uses a plain CREATE INDEX instead — it briefly locks each table against
-- writes while building, which is fine at this app's current table sizes.
-- If a table grows large enough for that lock to matter, rebuild the index
-- with `CREATE INDEX CONCURRENTLY` run by hand outside a migration.
CREATE INDEX IF NOT EXISTS "Brand_name_idx" ON "Brand" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Category_name_idx" ON "Category" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_phone_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_email_idx" ON "Customer" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Customer_gstin_idx" ON "Customer" USING GIN ("gstin" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Invoice_invoiceNumber_idx" ON "Invoice" USING GIN ("invoiceNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_sku_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "PurchaseBill_billNumber_idx" ON "PurchaseBill" USING GIN ("billNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Vendor_name_idx" ON "Vendor" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Vendor_company_idx" ON "Vendor" USING GIN ("company" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Vendor_phone_idx" ON "Vendor" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Vendor_email_idx" ON "Vendor" USING GIN ("email" gin_trgm_ops);
