-- CreateTable
CREATE TABLE "BlockedTrack" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "blockedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedTrack_roomId_idx" ON "BlockedTrack"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedTrack_roomId_trackId_key" ON "BlockedTrack"("roomId", "trackId");

-- AddForeignKey
ALTER TABLE "BlockedTrack" ADD CONSTRAINT "BlockedTrack_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedTrack" ADD CONSTRAINT "BlockedTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
