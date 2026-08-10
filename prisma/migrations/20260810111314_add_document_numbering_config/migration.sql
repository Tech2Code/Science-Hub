-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "invoiceNumberPrefix" TEXT,
ADD COLUMN     "nextInvoiceNumberOverride" INTEGER,
ADD COLUMN     "nextPurchaseBillNumberOverride" INTEGER,
ADD COLUMN     "purchaseBillNumberPrefix" TEXT;
