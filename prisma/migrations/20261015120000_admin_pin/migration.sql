-- Admin PIN is back: lets a member reclaim admin and an offline admin rejoin.
ALTER TABLE "Room" ADD COLUMN "adminPinHash" TEXT;
