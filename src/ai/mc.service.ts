import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomStateService } from '../state/room-state.service';
import { readSettings } from '../state/settings';
import { AiService } from './ai.service';

/** Wait for the queue to settle before writing intros (people add songs in bursts). */
const DEBOUNCE_MS = 10_000;
const BATCH = 6;
const KEEP = 1000;

const SYSTEM = `Bạn là MC radio vui tính của một văn phòng ở Việt Nam. Viết cho mỗi bài một câu dẫn ngắn
(tối đa 22 từ, tiếng Việt tự nhiên, thân thiện) để đọc ngay trước khi bài phát.
- Nhắc tên bài, nghệ sĩ nếu có, và người chọn bài: viết đúng ký hiệu {P} ở chỗ tên người chọn (không tự đặt tên).
- Không bịa thông tin về bài hát hay nghệ sĩ. Không emoji, không hashtag, không dấu ngoặc kép.
- Mỗi câu một kiểu, đừng lặp cùng một mở đầu.
Trả lời đúng JSON: {"items":[{"i":<number>,"line":<string>}]}.`;

/**
 * AI3: the speaker's MC line before each member's song. Lines are written ahead of time
 * (in one AI call for the next few songs) and kept in memory by queue item, so starting
 * a song never waits for AI.
 */
@Injectable()
export class McService implements OnModuleInit {
  private readonly logger = new Logger(McService.name);
  private readonly lines = new Map<string, string>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: RoomStateService,
    private readonly ai: AiService,
  ) {}

  onModuleInit(): void {
    this.state.onDeleted((roomId) => {
      const t = this.timers.get(roomId);
      if (t) clearTimeout(t);
      this.timers.delete(roomId);
      this.busy.delete(roomId);
    });
    if (this.ai.enabled)
      this.state.onCommitted((roomId) => this.schedule(roomId));
  }

  /** The line for a queue item, if one is ready. */
  lineFor(queueItemId: string): string | null {
    return this.lines.get(queueItemId) ?? null;
  }

  private schedule(roomId: string): void {
    const old = this.timers.get(roomId);
    if (old) clearTimeout(old);
    const t = setTimeout(() => {
      this.timers.delete(roomId);
      void this.prepare(roomId);
    }, DEBOUNCE_MS);
    t.unref();
    this.timers.set(roomId, t);
  }

  async prepare(roomId: string): Promise<number> {
    if (this.busy.has(roomId)) return 0;
    this.busy.add(roomId);
    try {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { settings: true },
      });
      if (!room || !readSettings(room.settings).mcIntro) return 0;
      const items = (
        await this.prisma.queueItem.findMany({
          where: { roomId, status: 'QUEUED', addedById: { not: null } },
          orderBy: { addedAt: 'asc' },
          take: 20,
          include: { track: true, addedBy: { select: { displayName: true } } },
        })
      )
        .filter((q) => !this.lines.has(q.id))
        .slice(0, BATCH);
      if (!items.length) return 0;
      const answer = await this.ai.json<{
        items?: { i?: number; line?: string }[];
      }>(
        'mc',
        SYSTEM,
        JSON.stringify(
          items.map((q, i) => ({
            i,
            song: q.track.song ?? q.track.title,
            artist: q.track.artist,
            // People's names never reach the AI provider: it writes {P}, we put the name back.
            picker: q.addedBy ? '{P}' : null,
          })),
        ),
        { temperature: 0.9 },
      );
      let n = 0;
      for (const a of answer?.items ?? []) {
        const q = typeof a.i === 'number' ? items[a.i] : undefined;
        const line =
          typeof a.line === 'string'
            ? a.line.replace(/["“”]/g, '').trim().slice(0, 200)
            : '';
        if (!q || !line) continue;
        const name = q.addedBy?.displayName ?? '';
        this.lines.set(
          q.id,
          line.replaceAll('{P}', name).replace(/\s+/g, ' ').trim(),
        );
        n += 1;
      }
      while (this.lines.size > KEEP)
        this.lines.delete(this.lines.keys().next().value as string);
      return n;
    } catch (e) {
      this.logger.warn(`MC lines for room ${roomId} failed: ${String(e)}`);
      return 0;
    } finally {
      this.busy.delete(roomId);
    }
  }
}
