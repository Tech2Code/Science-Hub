-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "licenses" JSONB NOT NULL DEFAULT '[{"label":"MD42 License No","number":"RMD/DCD/HO-2452/461"},{"label":"MSME License No","number":"UDYAM-DL-06-0019811"}]'::jsonb;
