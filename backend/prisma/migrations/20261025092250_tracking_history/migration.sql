-- AlterTable
ALTER TABLE "TrackingEvent" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "fromStatus" "TrackingStatus";

-- CreateIndex
CREATE INDEX "TrackingEvent_orderId_createdAt_idx" ON "TrackingEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
