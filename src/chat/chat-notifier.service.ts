import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { NowPlayingView } from '../contracts';
import type { ChatLink } from '../generated/prisma/client';
import { RoomStateService } from '../state/room-state.service';
import { SnapshotService } from '../state/snapshot.service';
import { ChatRoomService } from './chat-room.service';
import { SlackApi } from './slack/slack-api.service';
import {
  type VoteCard,
  voteMessage,
  voteResultMessage,
} from './slack/slack-blocks';

/** Countdown refresh while a vote is open (Slack allows ~1 update per second per channel). */
const TICK_MS = 5000;
const LINKS_TTL_MS = 30_000;

interface OpenVote {
  itemId: string;
  title: string;
  /** One message per linked channel. */
  messages: { link: ChatLink; ts: string }[];
  lastKey: string;
  timer: NodeJS.Timeout;
}

/**
 * Đợt 3: posts the room's skip vote (V1) into every linked channel the moment it opens,
 * keeps the tally and countdown current, and turns the message into the result when it
 * closes — whether people voted on the web, the mini player or in Slack.
 */
@Injectable()
export class ChatNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatNotifierService.name);
  private readonly votes = new Map<string, OpenVote>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly linkCache = new Map<
    string,
    { at: number; links: ChatLink[] }
  >();

  constructor(
    private readonly state: RoomStateService,
    private readonly snapshots: SnapshotService,
    private readonly chat: ChatRoomService,
    private readonly slack: SlackApi,
  ) {}

  onModuleInit(): void {
    if (!this.slack.enabled) return;
    this.state.onCommitted((roomId) => this.schedule(roomId));
  }

  onModuleDestroy(): void {
    for (const v of this.votes.values()) clearInterval(v.timer);
    this.votes.clear();
  }

  /** After a channel was linked or unlinked. */
  forget(roomId: string): void {
    this.linkCache.delete(roomId);
  }

  /** One check at a time per room, so a burst of changes never posts a vote twice. */
  private schedule(roomId: string): void {
    const prev = this.chains.get(roomId) ?? Promise.resolve();
    const next = prev
      .then(() => this.check(roomId))
      .catch((e: unknown) =>
        this.logger.warn(`chat notify failed for ${roomId}: ${String(e)}`),
      );
    this.chains.set(roomId, next);
    void next.finally(() => {
      if (this.chains.get(roomId) === next) this.chains.delete(roomId);
    });
  }

  private async links(roomId: string): Promise<ChatLink[]> {
    const hit = this.linkCache.get(roomId);
    if (hit && Date.now() - hit.at < LINKS_TTL_MS) return hit.links;
    const links = (await this.chat.linksOfRoom(roomId)).filter(
      (l) => l.platform === 'slack',
    );
    this.linkCache.set(roomId, { at: Date.now(), links });
    return links;
  }

  private async check(roomId: string): Promise<void> {
    const current = this.votes.get(roomId);
    const links = await this.links(roomId);
    if (!links.length && !current) return;
    const snap = await this.snapshots.build(roomId);
    const np = snap?.nowPlaying ?? null;
    const open = np && np.skip.endsAt !== null ? np : null;

    if (current && (!open || open.item.id !== current.itemId)) {
      await this.finish(roomId, current, np?.item.id !== current.itemId);
    }
    if (!open) return;

    const card = toCard(open);
    const { text, blocks } = voteMessage(card);
    const key = `${card.votes}|${card.required}|${card.against}|${card.secondsLeft}`;
    const existing = this.votes.get(roomId);
    if (!existing) {
      const messages: OpenVote['messages'] = [];
      for (const link of links) {
        const ts = await this.slack.post(
          link.channelId,
          text,
          blocks,
          link.threadTs,
        );
        if (ts) messages.push({ link, ts });
      }
      const timer = setInterval(() => this.schedule(roomId), TICK_MS);
      timer.unref();
      this.votes.set(roomId, {
        itemId: open.item.id,
        title: open.item.track.title,
        messages,
        lastKey: key,
        timer,
      });
      return;
    }
    if (existing.lastKey === key) return;
    existing.lastKey = key;
    for (const m of existing.messages)
      await this.slack.update(m.link.channelId, m.ts, text, blocks);
  }

  private async finish(
    roomId: string,
    vote: OpenVote,
    skipped: boolean,
  ): Promise<void> {
    clearInterval(vote.timer);
    this.votes.delete(roomId);
    const { text, blocks } = voteResultMessage(vote.title, skipped);
    for (const m of vote.messages)
      await this.slack.update(m.link.channelId, m.ts, text, blocks);
  }
}

function toCard(np: NowPlayingView): VoteCard {
  return {
    itemId: np.item.id,
    title: np.item.track.title,
    thumbnailUrl: np.item.track.thumbnailUrl,
    openedBy: np.skip.openedBy?.displayName ?? null,
    votes: np.skip.votes,
    required: np.skip.required,
    against: np.skip.against,
    secondsLeft: Math.max(
      0,
      Math.ceil(((np.skip.endsAt ?? 0) - Date.now()) / 1000),
    ),
  };
}
