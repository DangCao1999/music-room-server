import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import type { DjSound, Reaction } from '../contracts';
import type { Member } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Broadcaster } from '../realtime/broadcaster.service';
import type { Actor } from '../state/room-state.service';
import { toChatView } from '../state/views';
import { KEEP_CHAT } from './activity.service';

export const CHAT_LIMIT = { count: 5, windowMs: 10_000 };
export const REACTION_LIMIT = { count: 10, windowMs: 10_000 };
export const DJ_COOLDOWN_MS = 1500;

/**
 * Chat (R-38), reactions (R-39) and the DJ soundboard (R-40). These do not change
 * room state, so they skip the room lock and only verify the sender.
 */
@Injectable()
export class SocialService {
  readonly limiter = new RateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcaster: Broadcaster,
  ) {}

  private async sender(actor: Actor): Promise<Member> {
    const m = await this.prisma.member.findUnique({
      where: { id: actor.memberId },
    });
    if (!m || m.roomId !== actor.roomId || m.leftAt || m.kickedAt) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (m.isDevice) throw new AppError('FORBIDDEN');
    return m;
  }

  private limit(key: string, rule: { count: number; windowMs: number }): void {
    const r = this.limiter.hit(key, rule.count, rule.windowMs, Date.now());
    if (!r.ok) throw new AppError('RATE_LIMITED', { seconds: r.retryAfterSec });
  }

  async chat(actor: Actor, content: string): Promise<void> {
    const me = await this.sender(actor);
    this.limit(`chat:${me.id}`, CHAT_LIMIT);
    const row = await this.prisma.chatMessage.create({
      data: {
        roomId: actor.roomId,
        memberId: me.id,
        displayName: me.displayName,
        content,
      },
    });
    this.broadcaster.toRoom(actor.roomId, 'chat:receive', toChatView(row));
    await this.prisma.$executeRaw`
      DELETE FROM "ChatMessage" WHERE "id" IN (
        SELECT "id" FROM "ChatMessage" WHERE "roomId" = ${actor.roomId}
        ORDER BY "createdAt" DESC OFFSET ${KEEP_CHAT})`;
  }

  async chatHistory(roomId: string) {
    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: KEEP_CHAT,
    });
    return rows.reverse().map(toChatView);
  }

  async reaction(actor: Actor, emoji: Reaction): Promise<void> {
    const me = await this.sender(actor);
    this.limit(`reaction:${me.id}`, REACTION_LIMIT);
    this.broadcaster.toRoom(actor.roomId, 'room:reaction', {
      emoji,
      memberId: me.id,
    });
  }

  async dj(actor: Actor, soundType: DjSound): Promise<void> {
    const me = await this.sender(actor);
    if (!me.canDj && me.role !== 'ADMIN') throw new AppError('FORBIDDEN');
    this.limit(`dj:${me.id}`, { count: 1, windowMs: DJ_COOLDOWN_MS });
    this.broadcaster.toRoom(actor.roomId, 'dj:event', {
      soundType,
      memberId: me.id,
      displayName: me.displayName,
    });
  }
}
