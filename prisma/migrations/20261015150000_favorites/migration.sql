-- "Lưu" (A2): a member's saved songs.
CREATE TABLE "Favorite" (
    "memberId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("memberId","trackId")
);

CREATE INDEX "Favorite_memberId_createdAt_idx" ON "Favorite"("memberId", "createdAt");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
