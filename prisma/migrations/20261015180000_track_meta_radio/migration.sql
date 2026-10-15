-- AI1: artist / song parsed from the title; A4: who added an item when no member did.
ALTER TABLE "Track" ADD COLUMN "artist" TEXT,
ADD COLUMN "artistKey" TEXT,
ADD COLUMN "metaAt" TIMESTAMP(3),
ADD COLUMN "metaSource" TEXT,
ADD COLUMN "song" TEXT,
ADD COLUMN "songKey" TEXT;

ALTER TABLE "QueueItem" ADD COLUMN "auto" TEXT;

-- Items with no member are the fallback playlist's (the only automatic source so far).
UPDATE "QueueItem" SET "auto" = 'fallback' WHERE "addedById" IS NULL;

CREATE INDEX "Track_artistKey_idx" ON "Track"("artistKey");
