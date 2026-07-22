-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BusinessSettings" ALTER COLUMN "termsAndConditions" SET DEFAULT 'Interest @ 24%p.a would be charged after 45 days of Invoice
Material sold strictly for lab use only
We are not responsible for any loss in transit.
Subject to ''Delhi'' Jurisdiction only.';

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SectionPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SectionPermission_userId_idx" ON "SectionPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionPermission_userId_section_key" ON "SectionPermission"("userId", "section");

-- AddForeignKey
ALTER TABLE "SectionPermission" ADD CONSTRAINT "SectionPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
