-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "RateList" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_idempotencyKey_key" ON "Customer"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_idempotencyKey_key" ON "Vendor"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RateList_idempotencyKey_key" ON "RateList"("idempotencyKey");
