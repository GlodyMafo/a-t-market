/*
  Migration payment shipping logic
*/


-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PRODUCT', 'SHIPPING', 'FULL');


-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_PAID';


-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIAL';



-- Ajouter temporairement les colonnes

ALTER TABLE "Order"
ADD COLUMN "productsAmount" DECIMAL(10,2),
ADD COLUMN "shippingAmount" DECIMAL(10,2);



-- Migration des anciennes données

UPDATE "Order"
SET
"productsAmount" = "totalAmount",
"shippingAmount" = 0
WHERE "productsAmount" IS NULL;



-- Sécurité pour les futures commandes

ALTER TABLE "Order"
ALTER COLUMN "productsAmount" SET NOT NULL;



ALTER TABLE "Order"
ALTER COLUMN "shippingAmount" SET NOT NULL;



ALTER TABLE "Order"
ALTER COLUMN "shippingAmount"
SET DEFAULT 0;



-- Payment

ALTER TABLE "Payment"
ADD COLUMN "type" "PaymentType"
NOT NULL DEFAULT 'FULL';