-- The admin PIN feature was removed: the speaker page opens with the room code only.
ALTER TABLE "Room" DROP COLUMN "adminPinHash";
