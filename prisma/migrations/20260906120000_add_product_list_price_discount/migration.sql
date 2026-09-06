-- listPrice: vendor's quoted price before their trade discount (nullable — legacy products predate this).
-- discountPercent: vendor's trade discount % applied to listPrice to arrive at purchasePrice.
ALTER TABLE "Product" ADD COLUMN "listPrice" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
