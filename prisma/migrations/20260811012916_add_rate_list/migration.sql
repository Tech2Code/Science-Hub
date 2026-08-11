-- CreateTable
CREATE TABLE "RateList" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RateList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateListItem" (
    "id" TEXT NOT NULL,
    "rateListId" TEXT NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "unit" TEXT NOT NULL,
    "isNetRate" BOOLEAN NOT NULL DEFAULT false,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "listRate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RateListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateList_deletedAt_idx" ON "RateList"("deletedAt");

-- CreateIndex
CREATE INDEX "RateListItem_rateListId_idx" ON "RateListItem"("rateListId");

-- AddForeignKey
ALTER TABLE "RateList" ADD CONSTRAINT "RateList_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateListItem" ADD CONSTRAINT "RateListItem_rateListId_fkey" FOREIGN KEY ("rateListId") REFERENCES "RateList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
