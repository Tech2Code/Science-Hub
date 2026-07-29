-- Allow an invoice line item to exist without a linked catalog product
-- (e.g. "Delivery Charges") — mirrors PurchaseBillItem.productId, which was
-- already nullable. The foreign key itself is unaffected; only the
-- NOT NULL constraint on the column is dropped.
ALTER TABLE "InvoiceItem" ALTER COLUMN "productId" DROP NOT NULL;
