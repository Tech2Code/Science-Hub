-- AlterTable
ALTER TABLE "Return" ADD COLUMN "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
