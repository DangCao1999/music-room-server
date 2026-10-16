import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import {
  cleanLine,
  nameKey,
  normalizeRoomCode,
  type Reaction,
  type TrackSummary,
} from '../contracts';
import type { ChatLink, Member } from '../generated/prisma/client';
import { SearchService } from '../music/search.service';
import { PlaybackService } from '../playback/playback.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { PresenceService } from '../realtime/presence.service';
import { ActivityService } from '../social/activity.service';
import { SocialService } from '../social/social.service';
import type { Actor } from '../state/room-state.service';
import { RoomStateService } from '../state/room-state.service';
import { readSettings } from '../state/settings';
import { SnapshotService } from '../state/snapshot.service';

export type ChatPlatformName = 'slack';

/** Who wrote in the chat app, as that app reports it. */
export interface ChatUser {
  platform: ChatPlatformName;
  teamId: string;
  userId: string;
  name: string;
  email: string | null;
}

export interface NowView {
  roomName: string;
  roomCode: string;
  roomUrl: string;
  playing: {
    itemId: string;
    title: string;
    thumbnailUrl: string | null;
    pickedBy: string | null;
    paused: boolean;
    positionSec: number;
    durationSec: number | null;
  } | null;
  next: { title: string; pickedBy: string | null }[];
}

const MEMBER_COLORS = [
  '#f6a623',
  '#5fd39a',
  '#7cc4ff',
  '#ff9a8e',
  '#c9a7ff',
  '#ffd166',
];
/** A chat voter stays counted a little past the deadline, so the last tally includes them. */
const VOTER_GRACE_MS = 5_000;

/**
 * Đợt 3: what chat apps (Slack first) can do in a room. Platform adapters translate their
 * commands and buttons into these calls; the rules are the room's own (queue limits, the
 * V1 skip vote, rate limits) because every call goes through the same services as the web.
 */
@Injectable()
export class ChatRoomService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly state: RoomStateService,
    private readonly snapshots: SnapshotService,
    private readonly queue: QueueService,
    private readonly search: SearchService,
    private readonly playback: PlaybackService,
    private readonly social: SocialService,
    private readonly presence: PresenceService,
    private readonly activity: ActivityService,
  ) {}

  // ------------------------------------------------------------ channel ↔ room

  link(platform: ChatPlatformName, teamId: string, channelId: string) {
    return this.prisma.chatLink.findUnique({
      where: { platform_teamId_channelId: { platform, teamId, channelId } },
      include: { room: { select: { id: true, code: true, name: true } } },
    });
  }

  linksOfRoom(roomId: string): Promise<ChatLink[]> {
    return this.prisma.chatLink.findMany({ where: { roomId } });
  }

  /** Admin PIN required; the same lockout as the web (per workspace and room). */
  async connect(
    platform: ChatPlatformName,
    teamId: string,
    channelId: string,
    code: string,
    pin: string,
  ): Promise<{ name: string; code: string }> {
    const room = await this.prisma.room.findUnique({
      where: { code: normalizeRoomCode(code) },
    });
    if (!room) throw new AppError('ROOM_NOT_FOUND');
    await this.auth.checkPin(
      room.adminPinHash,
      pin,
      `${platform}|${teamId}|${room.id}`,
    );
    await this.prisma.chatLink.upsert({
      where: { platform_teamId_channelId: { platform, teamId, channelId } },
      create: { platform, teamId, channelId, roomId: room.id },
      update: { roomId: room.id },
    });
    return { name: room.name, code: room.code };
  }

  async disconnect(
    platform: ChatPlatformName,
    teamId: string,
    channelId: string,
    pin: string,
  ): Promise<void> {
    const link = await this.link(platform, teamId, channelId);
    if (!link) return;
    const room = await this.prisma.room.findUniqueOrThrow({
      where: { id: link.roomId },
    });
    await this.auth.checkPin(
      room.adminPinHash,
      pin,
      `${platform}|${teamId}|${room.id}`,
    );
    await this.prisma.chatLink.delete({ where: { id: link.id } });
  }

  // ------------------------------------------------------------ who is acting

  /**
   * The member a chat user acts as: the one already tied to them, else the member of the
   * Google account with the same email, else a new member named after them.
   */
  async member(roomId: string, user: ChatUser): Promise<Member> {
    const tied = await this.prisma.member.findFirst({
      where: { roomId, slackUserId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
    if (tied?.kickedAt) throw new AppError('FORBIDDEN');
    if (tied && !tied.leftAt) return tied;

    if (user.email) {
      const account = await this.prisma.user.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' } },
      });
      const mine = account
        ? await this.prisma.member.findFirst({
            where: { roomId, userId: account.id, leftAt: null, kickedAt: null },
          })
        : null;
      if (mine) {
        return this.prisma.member.update({
          where: { id: mine.id },
          data: { slackUserId: user.userId },
        });
      }
    }

    const base = cleanLine(user.name).slice(0, 30) || 'Slack';
    const room = await this.prisma.room.findUniqueOrThrow({
      where: { id: roomId },
      select: { settings: true },
    });
    const settings = readSettings(room.settings);
    for (const name of [
      base,
      `${base.slice(0, 22)} (Slack)`,
      ...[2, 3, 4, 5].map((n) => `${base.slice(0, 26)} ${n}`),
    ]) {
      const taken = await this.prisma.member.findFirst({
        where: {
          roomId,
          displayNameKey: nameKey(name),
          leftAt: null,
          kickedAt: null,
        },
      });
      if (taken) continue;
      return this.state.mutate(roomId, async (tx, ctx) => {
        const m = await tx.member.create({
          data: {
            roomId,
            displayName: name,
            displayNameKey: nameKey(name),
            color:
              MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
            canDj: settings.allowGuestDj,
            slackUserId: user.userId,
          },
        });
        await this.activity.log(
          tx,
          ctx,
          roomId,
          m,
          'user_join',
          'đã vào phòng từ Slack',
        );
        return m;
      });
    }
    throw new AppError('NAME_TAKEN');
  }

  private actor(m: Member, platform: ChatPlatformName): Actor {
    return {
      memberId: m.id,
      roomId: m.roomId,
      socketId: `chat:${platform}`,
      ip: `chat:${platform}`,
    };
  }

  // ------------------------------------------------------------ actions

  async add(roomId: string, user: ChatUser, input: string) {
    const m = await this.member(roomId, user);
    return this.queue.add(this.actor(m, user.platform), { input });
  }

  /** Top results for a song name (free sources first, then YouTube under the member's limit). */
  async find(
    roomId: string,
    user: ChatUser,
    q: string,
  ): Promise<TrackSummary[]> {
    const m = await this.member(roomId, user);
    const { results } = await this.search.search(m.id, q);
    return results.slice(0, 3);
  }

  /** V1 vote from a chat app; the voter counts as present until the vote ends. */
  async vote(
    roomId: string,
    user: ChatUser,
    approve: boolean,
    itemId?: string,
  ): Promise<void> {
    const m = await this.member(roomId, user);
    const snap = await this.snapshots.build(roomId);
    const np = snap?.nowPlaying;
    if (!np) throw new AppError('STALE_ITEM');
    if (itemId && itemId !== np.item.id) throw new AppError('STALE_ITEM');
    const ends =
      np.skip.endsAt ??
      Date.now() + snap.room.settings.skipVoteWindowSec * 1000;
    this.presence.addChatVoter(roomId, m.id, ends + VOTER_GRACE_MS);
    await this.playback.voteSkip(
      this.actor(m, user.platform),
      np.item.id,
      approve,
    );
  }

  async react(roomId: string, user: ChatUser, emoji: Reaction): Promise<void> {
    const m = await this.member(roomId, user);
    await this.social.reaction(this.actor(m, user.platform), emoji);
  }

  async now(roomId: string): Promise<NowView | null> {
    const snap = await this.snapshots.build(roomId);
    if (!snap) return null;
    const np = snap.nowPlaying;
    return {
      roomName: snap.room.name,
      roomCode: snap.room.code,
      roomUrl: `${this.env.PUBLIC_URL.replace(/\/$/, '')}/r/${snap.room.code}`,
      playing: np
        ? {
            itemId: np.item.id,
            title: np.item.track.title,
            thumbnailUrl: np.item.track.thumbnailUrl,
            pickedBy: np.item.addedBy?.displayName ?? null,
            paused: np.status === 'PAUSED',
            positionSec: np.positionSec,
            durationSec: np.item.track.durationSec,
          }
        : null,
      next: snap.queue.slice(0, 5).map((q) => ({
        title: q.track.title,
        pickedBy: q.addedBy?.displayName ?? null,
      })),
    };
  }
}
