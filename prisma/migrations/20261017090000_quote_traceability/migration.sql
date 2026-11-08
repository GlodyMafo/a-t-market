-- CreateEnum
CREATE TYPE "QuoteWeightSource" AS ENUM ('EXTRACTED', 'CATALOG_ESTIMATE', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuoteRevisionAction" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "InternationalQuote" ADD COLUMN     "chinaPricePerKg" DECIMAL(10,2),
ADD COLUMN     "commissionRate" DECIMAL(10,2),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "fixedFee" DECIMAL(10,2),
ADD COLUMN     "weightSource" "QuoteWeightSource";

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "QuoteRevisionAction" NOT NULL,
    "note" TEXT,
    "snapshotBefore" JSONB NOT NULL,
    "snapshotAfter" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteRevision_quoteId_idx" ON "QuoteRevision"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "InternationalQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;