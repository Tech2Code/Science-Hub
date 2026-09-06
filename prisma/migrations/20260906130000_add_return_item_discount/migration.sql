-- discountPercent/discountAmount: carries the original invoice line's discount forward onto the
-- credit note so a return's taxable value is computed net of it, instead of refunding the
-- pre-discount gross price. Defaults to 0 so existing rows (computed without a discount) are
-- unaffected.
ALTER TABLE "ReturnItem" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ReturnItem" ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
