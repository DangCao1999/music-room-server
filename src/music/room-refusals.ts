import type { RoomSettings } from '../contracts';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Pick<PrismaService, 'blockedTrack' | 'queueItem'>;

/**
 * Songs the room would refuse to add right now, so suggestions never offer them:
 * blocked by the admin, or started within the room's repeat gap (A6, the same rule as
 * queue:add → PLAYED_RECENTLY).
 */
export async function refusedTrackIds(
  db: Db,
  roomId: string,
  settings: RoomSettings,
  now = Date.now(),
): Promise<Set<string>> {
  const [blocked, recent] = await Promise.all([
    db.blockedTrack.findMany({ where: { roomId }, select: { trackId: true } }),
    settings.repeatGapMinutes > 0
      ? db.queueItem.findMany({
          where: {
            roomId,
            startedAt: {
              gte: new Date(now - settings.repeatGapMinutes * 60_000),
            },
          },
          select: { trackId: true },
        })
      : Promise.resolve([] as { trackId: string }[]),
  ]);
  return new Set([
    ...blocked.map((b) => b.trackId),
    ...recent.map((r) => r.trackId),
  ]);
}
