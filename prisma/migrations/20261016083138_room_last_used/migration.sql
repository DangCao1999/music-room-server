-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Room_ownerId_lastUsedAt_idx" ON "Room"("ownerId", "lastUsedAt");

-- Existing rooms: the last time a person did something there (robots do not count).
UPDATE "Room" r SET "lastUsedAt" = GREATEST(
  r."createdAt",
  COALESCE((SELECT max("lastSeenAt") FROM "Member" WHERE "roomId" = r.id), r."createdAt"),
  COALESCE((SELECT max("addedAt") FROM "QueueItem" WHERE "roomId" = r.id AND "addedById" IS NOT NULL), r."createdAt"),
  COALESCE((SELECT max("createdAt") FROM "ActivityLog" WHERE "roomId" = r.id AND "memberId" IS NOT NULL), r."createdAt")
);
