import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import type { BlockedTrackView } from '../contracts';
import type { Member } from '../generated/prisma/client';
import { PlaybackService } from '../playback/playback.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ActivityService } from '../social/activity.service';
import { type Actor, RoomStateService } from '../state/room-state.service';
import { toTrackSummary } from '../state/views';

/** True when the room's admin blocked this video (`youtube:<id>`). */
export async function isBlocked(
  db: Pick<Tx, 'blockedTrack'>,
  roomId: string,
  trackId: string,
): Promise<boolean> {
  const row = await db.blockedTrack.findUnique({
    where: { roomId_trackId: { roomId, trackId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Admin-only blocking of a video in a room: it stops / leaves the queue at once and nobody
 * (the admin included) can add it again until it is unblocked. Every way into the queue
 * checks `isBlocked` (QueueService.checkAddable, radio, fallback playlist).
 */
@Injectable()
export class BlockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RoomStateService,
    private readonly playback: PlaybackService,
    private readonly activity: ActivityService,
  ) {}

  private static requireAdmin(me: Member): void {
    if (me.role !== 'ADMIN') throw new AppError('FORBIDDEN');
  }

  async block(actor: Actor, trackId: string): Promise<void> {
    await this.state.mutate(actor.roomId, async (tx, ctx) => {
      const me = await this.state.activeMember(tx, actor);
      BlockService.requireAdmin(me);
      const track = await tx.track.findUnique({ where: { id: trackId } });
      if (!track) throw new AppError('TRACK_NOT_FOUND');
      if (await isBlocked(tx, actor.roomId, trackId)) return;
      await tx.blockedTrack.create({
        data: { roomId: actor.roomId, trackId, blockedByName: me.displayName },
      });
      await tx.queueItem.updateMany({
        where: { roomId: actor.roomId, trackId, status: 'QUEUED' },
        data: { status: 'REMOVED' },
      });
      // Playing (or paused) right now: move on like the admin's ⏭, no vote.
      const ps = await tx.playbackState.findUnique({
        where: { roomId: actor.roomId },
      });
      const current = ps?.currentItemId
        ? await tx.queueItem.findUnique({
            where: { id: ps.currentItemId },
            select: { trackId: true },
          })
        : null;
      if (ps?.currentItemId && current?.trackId === trackId) {
        await this.playback.advance(
          tx,
          ctx,
          actor.roomId,
          ps.currentItemId,
          'skip',
        );
      }
      await this.activity.log(
        tx,
        ctx,
        actor.roomId,
        me,
        'track_block',
        `đã chặn "${track.title}"`,
      );
    });
  }

  async unblock(actor: Actor, trackId: string): Promise<void> {
    await this.state.mutate(actor.roomId, async (tx, ctx) => {
      const me = await this.state.activeMember(tx, actor);
      BlockService.requireAdmin(me);
      const { count } = await tx.blockedTrack.deleteMany({
        where: { roomId: actor.roomId, trackId },
      });
      if (!count) return;
      const track = await tx.track.findUnique({
        where: { id: trackId },
        select: { title: true },
      });
      await this.activity.log(
        tx,
        ctx,
        actor.roomId,
        me,
        'track_unblock',
        `đã bỏ chặn "${track?.title ?? trackId}"`,
      );
    });
  }

  async list(actor: Actor): Promise<{ items: BlockedTrackView[] }> {
    const me = await this.prisma.member.findUnique({
      where: { id: actor.memberId },
    });
    if (!me || me.roomId !== actor.roomId || me.leftAt || me.kickedAt)
      throw new AppError('UNAUTHENTICATED');
    BlockService.requireAdmin(me);
    const rows = await this.prisma.blockedTrack.findMany({
      where: { roomId: actor.roomId },
      orderBy: { createdAt: 'desc' },
      include: { track: true },
    });
    return {
      items: rows.map((r) => ({
        track: toTrackSummary(r.track),
        blockedByName: r.blockedByName,
        blockedAt: r.createdAt.toISOString(),
      })),
    };
  }
}
