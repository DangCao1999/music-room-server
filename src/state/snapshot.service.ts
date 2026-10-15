import { Inject, Injectable } from '@nestjs/common';
import type { MemberView, RoomSnapshot } from '../contracts';
import { ENV, type Env } from '../config/env';
import { LeaseService } from '../playback/lease.service';
import { countVotes, requiredVotes } from '../playback/skip-votes';
import { PrismaService } from '../prisma/prisma.service';
import { orderQueue } from '../queue/fair-queue';
import { lastPlayedMap } from '../queue/last-played';
import { PresenceService } from '../realtime/presence.service';
import { readSettings } from './settings';
import {
  estimatePosition,
  ITEM_INCLUDE,
  type ItemWithRelations,
  toItemView,
} from './views';

@Injectable()
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly lease: LeaseService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Members that still count for votes: online, not a device (R-25). */
  onlineVoters(
    roomId: string,
    members: { id: string; isDevice: boolean }[],
  ): Set<string> {
    const online = this.presence.onlineMembers(roomId);
    return new Set(
      members.filter((m) => !m.isDevice && online.has(m.id)).map((m) => m.id),
    );
  }

  async build(roomId: string): Promise<RoomSnapshot | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        playback: true,
        members: {
          where: { leftAt: null, kickedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!room || !room.playback) return null;
    const ps = room.playback;
    const now = Date.now();
    const settings = readSettings(room.settings);
    const online = this.presence.onlineMembers(roomId);

    const [queued, current] = await Promise.all([
      this.prisma.queueItem.findMany({
        where: { roomId, status: 'QUEUED' },
        include: ITEM_INCLUDE,
      }),
      ps.currentItemId
        ? this.prisma.queueItem.findUnique({
            where: { id: ps.currentItemId },
            include: {
              ...ITEM_INCLUDE,
              skipVotes: { select: { memberId: true } },
            },
          })
        : null,
    ]);

    const lastPlayed = await lastPlayedMap(this.prisma, roomId);
    const ordered = orderQueue(
      queued.map((q) => ({
        ...q,
        addedAt: q.addedAt.getTime(),
        pinnedAt: q.pinnedAt?.getTime() ?? null,
        hearts: q.hearts.length,
        _row: q,
      })),
      lastPlayed,
    );

    const members: MemberView[] = room.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      color: m.color,
      role: m.role,
      isDevice: m.isDevice,
      canPlay: m.canPlay,
      canControl: m.canControl,
      canDj: m.canDj,
      online: online.has(m.id),
    }));

    let nowPlaying: RoomSnapshot['nowPlaying'] = null;
    if (current && ps.status !== 'IDLE') {
      const voters = this.onlineVoters(roomId, room.members);
      const skip = countVotes(
        current.skipVotes.map((v) => v.memberId),
        voters,
      );
      nowPlaying = {
        item: toItemView(current, 0),
        status: ps.status,
        positionSec: estimatePosition(ps, now),
        positionAt: now,
        skip: {
          ...skip,
          required: requiredVotes(voters.size, settings.skipThreshold),
        },
      };
    }

    return {
      version: ps.version,
      serverTime: now,
      room: {
        code: room.code,
        name: room.name,
        settings,
        hasPin: room.adminPinHash !== null,
      },
      members,
      queue: ordered.map((o) =>
        toItemView(o._row as ItemWithRelations, o.round),
      ),
      status: nowPlaying ? ps.status : 'IDLE',
      nowPlaying,
      player: {
        memberId: ps.playerMemberId,
        online: this.lease.isOnline(roomId),
      },
      searchEnabled: Boolean(this.env.YOUTUBE_API_KEY),
      aiEnabled: Boolean(
        this.env.GEMINI_API_KEY ||
        this.env.GROQ_API_KEY ||
        (this.env.OPENROUTER_API_KEY && this.env.OPENROUTER_MODEL),
      ),
    };
  }
}
