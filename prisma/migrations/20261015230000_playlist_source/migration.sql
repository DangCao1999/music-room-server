-- L3: imported playlists remember their YouTube source, so a re-import updates them.
-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_ownerId_source_key" ON "Playlist"("ownerId", "source");

