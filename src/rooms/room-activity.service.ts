import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** At most one write per room in this window: "last used" only needs day precision. */
const TOUCH_EVERY_MS = 10 * 60_000;

/**
 * `Room.lastUsedAt`: the last time a person did something in the room, on the web or in
 * Slack. Radio, the fallback playlist and playback timers never call this, so a room that
 * only plays to nobody still counts as unused (orphan cleanup, RoomDeletionService).
 */
@Injectable()
export class RoomActivityService {
  private readonly logger = new Logger(RoomActivityService.name);
  private readonly last = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** Fire and forget: never slows down or fails the action that caused it. */
  touch(roomId: string): void {
    const now = Date.now();
    if (now - (this.last.get(roomId) ?? 0) < TOUCH_EVERY_MS) return;
    this.last.set(roomId, now);
    void this.prisma.room
      .updateMany({
        where: {
          id: roomId,
          lastUsedAt: { lt: new Date(now - TOUCH_EVERY_MS) },
        },
        data: { lastUsedAt: new Date(now) },
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `lastUsedAt update failed for ${roomId}: ${String(e)}`,
        ),
      );
  }

  forget(roomId: string): void {
    this.last.delete(roomId);
  }
}
