import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ChatNotifierService } from '../chat/chat-notifier.service';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { normalizeRoomCode } from '../contracts';
import { LeaseService } from '../playback/lease.service';
import { PrismaService } from '../prisma/prisma.service';
import { Broadcaster } from '../realtime/broadcaster.service';
import { PresenceService } from '../realtime/presence.service';
import type { Actor } from '../state/room-state.service';
import { RoomStateService } from '../state/room-state.service';
import { RoomActivityService } from './room-activity.service';

/** A room without an owner that nobody used this long is deleted. */
export const ORPHAN_ROOM_DAYS = 30;
/** Rooms deleted per cleanup run at most (the rest wait for the next day). */
const ORPHAN_BATCH = 200;

/**
 * Deleting a room, one way for everybody: the owner from the room or the home page, and the
 * daily cleanup of orphan rooms (no owner, unused for ORPHAN_ROOM_DAYS). Every child row
 * goes with the Room row (onDelete: Cascade); tracks, playlists and favourites stay.
 */
@Injectable()
export class RoomDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomDeletionService.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly state: RoomStateService,
    private readonly broadcaster: Broadcaster,
    private readonly presence: PresenceService,
    private readonly lease: LeaseService,
    private readonly activity: RoomActivityService,
    private readonly notifier: ChatNotifierService,
  ) {}

  onModuleInit(): void {
    const run = () =>
      void this.sweepOrphans().catch((e: unknown) =>
        this.logger.error(`orphan room cleanup failed: ${String(e)}`),
      );
    // unref(): never keeps the process alive.
    this.timers.push(setTimeout(run, this.env.ORPHAN_SWEEP_FIRST_MS).unref());
    this.timers.push(setInterval(run, this.env.ORPHAN_SWEEP_EVERY_MS).unref());
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
  }

  /** From inside the room: only its owner (signed in as Room.ownerId), code typed to confirm. */
  async deleteByOwner(actor: Actor, code: string): Promise<void> {
    const me = await this.prisma.member.findUnique({
      where: { id: actor.memberId },
      include: { room: { select: { id: true, code: true, ownerId: true } } },
    });
    if (!me || me.roomId !== actor.roomId || me.leftAt || me.kickedAt)
      throw new AppError('UNAUTHENTICATED');
    // The account signed in on this socket, not only the member row: on a shared computer
    // the owner may have signed out while their room session stayed.
    if (
      !me.room.ownerId ||
      me.userId !== me.room.ownerId ||
      actor.userId !== me.room.ownerId
    )
      throw new AppError('FORBIDDEN');
    if (normalizeRoomCode(code) !== me.room.code)
      throw new AppError('VALIDATION');
    await this.deleteRoom(me.room.id, 'owner', undefined, actor.socketId);
  }

  /** From the home page ("Phòng của tôi"): the signed-in account must own the room. */
  async deleteByAccount(
    userId: string,
    code: string,
    requesterSocketId?: string,
  ): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { code: normalizeRoomCode(code) },
      select: { id: true, ownerId: true },
    });
    if (!room) throw new AppError('ROOM_NOT_FOUND');
    if (room.ownerId !== userId) throw new AppError('FORBIDDEN');
    // The home page's socket may still be bound to that room: its answer must arrive.
    await this.deleteRoom(room.id, 'owner', undefined, requesterSocketId);
  }

  /**
   * Sends everyone in the room home (`room_deleted`), deletes the row, then lets every
   * service forget the room. `owner`: also tells the linked Slack channels.
   */
  async deleteRoom(
    roomId: string,
    why: 'owner' | 'orphan',
    orphanCutoff?: Date,
    requesterSocketId?: string,
  ): Promise<boolean> {
    const room = await this.state.exclusive(roomId, async () => {
      const r = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: { chatLinks: true },
      });
      if (!r) return null;
      // Checked again under the room's lock: someone may have come back in the meantime.
      if (
        why === 'orphan' &&
        (r.ownerId !== null ||
          !orphanCutoff ||
          r.lastUsedAt >= orphanCutoff ||
          this.presence.onlineMembers(roomId).size > 0 ||
          this.lease.isOnline(roomId))
      )
        return null;
      const evicted = this.broadcaster.evictRoom(
        roomId,
        'room_deleted',
        requesterSocketId,
      );
      await this.prisma.room.delete({ where: { id: roomId } });
      return { ...r, evicted };
    });
    if (!room) return false;
    this.lease.drop(roomId);
    this.presence.forgetRoom(roomId);
    this.activity.forget(roomId);
    if (why === 'owner') {
      await this.notifier
        .announceDeleted(roomId, room.name, room.chatLinks)
        .catch((e: unknown) =>
          this.logger.warn(
            `slack notice failed for ${room.code}: ${String(e)}`,
          ),
        );
    }
    this.state.emitDeleted(roomId);
    this.logger.log(
      `room deleted (${why}): ${room.code} "${room.name}" last used ${room.lastUsedAt.toISOString()}, ${room.evicted} socket(s) sent home`,
    );
    return true;
  }

  /** No owner, nobody did anything for ORPHAN_ROOM_DAYS and nobody online right now. */
  async sweepOrphans(now = new Date()): Promise<number> {
    // Someone has the room open right now (perhaps for weeks without reconnecting): that is
    // use, so the 30 days only start once the room is really empty.
    const online = this.presence.onlineRooms();
    if (online.length)
      await this.prisma.room.updateMany({
        where: { id: { in: online } },
        data: { lastUsedAt: now },
      });
    const cutoff = new Date(now.getTime() - ORPHAN_ROOM_DAYS * 86_400_000);
    const rooms = await this.prisma.room.findMany({
      where: { ownerId: null, lastUsedAt: { lt: cutoff } },
      orderBy: { lastUsedAt: 'asc' },
      take: ORPHAN_BATCH,
      select: { id: true },
    });
    let deleted = 0;
    // Someone (or the speaker page) in the room right now: in use, whatever the date says
    // (deleteRoom checks it under the room's lock).
    for (const r of rooms)
      if (await this.deleteRoom(r.id, 'orphan', cutoff)) deleted += 1;
    if (rooms.length)
      this.logger.log(
        `orphan room cleanup: ${deleted} deleted of ${rooms.length} unused for ${ORPHAN_ROOM_DAYS}+ days`,
      );
    return deleted;
  }
}
