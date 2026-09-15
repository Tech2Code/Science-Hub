-- AlterTable
-- Weighted-average cost at the moment of the return (src/lib/inventoryCosting.ts), so a credit
-- note's returned quantity can be netted out of both revenue and COGS on the profit dashboard.
ALTER TABLE "ReturnItem" ADD COLUMN     "costPrice" DOUBLE PRECISION;
