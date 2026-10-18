-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "quoteId" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InternationalQuote" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "options" TEXT,
ADD COLUMN     "previewId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "quoteId" TEXT,
ADD COLUMN     "quoteSnapshot" JSONB,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_quoteId_key" ON "CartItem"("cartId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "InternationalQuote_previewId_key" ON "InternationalQuote"("previewId");

-- CreateIndex
CREATE INDEX "OrderItem_quoteId_idx" ON "OrderItem"("quoteId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "InternationalQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "InternationalQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un article est SOIT un produit local, SOIT un devis (Prisma ne gère pas ces contraintes : écrites à la main)
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_product_xor_quote_check" CHECK (("productId" IS NOT NULL AND "quoteId" IS NULL) OR ("productId" IS NULL AND "quoteId" IS NOT NULL));

-- Un article est SOIT un produit local, SOIT un devis (Prisma ne gère pas ces contraintes : écrites à la main)
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_xor_quote_check" CHECK (("productId" IS NOT NULL AND "quoteId" IS NULL) OR ("productId" IS NULL AND "quoteId" IS NOT NULL));