-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN     "skipBlockedUntil" TIMESTAMP(3),
ADD COLUMN     "skipVoteById" TEXT,
ADD COLUMN     "skipVoteEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SkipVote" ADD COLUMN     "approve" BOOLEAN NOT NULL DEFAULT true;
