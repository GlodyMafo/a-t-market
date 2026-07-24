-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('AUTO_APPROVED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "InternationalQuote" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
