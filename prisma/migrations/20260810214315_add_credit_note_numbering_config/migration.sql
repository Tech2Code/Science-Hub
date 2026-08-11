-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "creditNoteNumberPrefix" TEXT,
ADD COLUMN     "nextCreditNoteNumberOverride" INTEGER,
ADD COLUMN     "creditNoteNumberFormat" TEXT;
