-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "payload" JSONB;
