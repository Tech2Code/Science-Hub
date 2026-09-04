-- Null = no credit limit enforced for that customer.
ALTER TABLE "Customer" ADD COLUMN "creditLimit" DOUBLE PRECISION;
