-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_PENDING_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_REJECTED';

-- AlterTable
ALTER TABLE "InternationalQuote" ADD COLUMN     "adminNotifiedAt" TIMESTAMP(3);
