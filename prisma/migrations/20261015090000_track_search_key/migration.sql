-- Normalised title + channel so search can answer from songs the server already knows
-- (no YouTube quota). Filled by the app for new and existing rows.
ALTER TABLE "Track" ADD COLUMN "searchKey" TEXT;
