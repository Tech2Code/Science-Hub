-- AlterTable
-- Loose reference (no FK constraint, mirrors ActivityLog.entityId) to the specific InvoiceItem a
-- custom (no-catalog) return line actually reverses, so its cost can be looked up exactly instead
-- of matched by item name within the invoice (ambiguous with duplicate-named custom lines).
ALTER TABLE "ReturnItem" ADD COLUMN     "sourceInvoiceItemId" TEXT;
