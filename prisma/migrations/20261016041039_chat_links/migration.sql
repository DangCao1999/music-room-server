-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "slackUserId" TEXT;

-- CreateTable
CREATE TABLE "ChatLink" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatLink_roomId_idx" ON "ChatLink"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatLink_platform_teamId_channelId_key" ON "ChatLink"("platform", "teamId", "channelId");

-- AddForeignKey
ALTER TABLE "ChatLink" ADD CONSTRAINT "ChatLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
