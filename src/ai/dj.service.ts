import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import {
  normalizeQuery,
  type RoomSettings,
  type SuggestionView,
} from '../contracts';
import type { Track } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toTrackSummary } from '../state/views';
import { AiService } from './ai.service';

const WANT = 10;
/** Songs the room knows, offered to the AI so it can pick them (no YouTube quota). */
const KNOWN_HINT = 40;

const SYSTEM = `Bạn là DJ cho một văn phòng ở Việt Nam. Người dùng mô tả loại nhạc họ muốn nghe.
Đề xuất ${WANT} bài hát CÓ THẬT, đúng yêu cầu, phù hợp nghe chung ở văn phòng.
- Nếu yêu cầu không nói rõ, ưu tiên nhạc Việt và nhạc quốc tế phổ biến.
- Nếu có bài phù hợp trong danh sách "known", hãy ưu tiên chọn chúng (ghi đúng tên như trong danh sách).
- Mỗi bài phải ghi ĐÚNG nghệ sĩ gốc đã trình bày bài đó. Không chắc thì bỏ bài đó, chọn bài khác.
- Không bịa bài. Không lặp bài, không lặp tên bài với nghệ sĩ khác.
Trả lời đúng JSON: {"items":[{"artist":<string>,"song":<string>}]}.`;

/**
 * AI2: songs for a request in plain words. Picks the server already knows are added in
 * one tap; the rest come back as "search" items, like Last.fm suggestions.
 */
@Injectable()
export class DjService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async ask(
    roomId: string,
    prompt: string,
    settings: RoomSettings,
  ): Promise<SuggestionView[]> {
    if (!this.ai.enabled) throw new AppError('AI_UNAVAILABLE');
    const known = await this.prisma.track.findMany({
      where: {
        artist: { not: null },
        song: { not: null },
        embeddable: true,
        title: { not: '' },
        queueItems: { some: { roomId } },
      },
      select: { artist: true, song: true },
      take: KNOWN_HINT,
    });
    const answer = await this.ai.json<{
      items?: { artist?: string; song?: string }[];
    }>(
      'dj',
      SYSTEM,
      JSON.stringify({
        request: prompt,
        known: known.map((k) => `${k.artist} - ${k.song}`),
      }),
      { temperature: 0.3 },
    );
    if (!answer) throw new AppError('AI_UNAVAILABLE');
    const picks = (answer.items ?? [])
      .filter(
        (p): p is { artist: string; song: string } =>
          typeof p.artist === 'string' &&
          typeof p.song === 'string' &&
          p.artist.trim() !== '' &&
          p.song.trim() !== '',
      )
      .slice(0, WANT)
      .map((p) => ({
        artist: p.artist.trim().slice(0, 100),
        song: p.song.trim().slice(0, 150),
      }));

    const waiting = new Set(
      (
        await this.prisma.queueItem.findMany({
          where: { roomId, status: { in: ['QUEUED', 'PLAYING'] } },
          select: { trackId: true },
        })
      ).map((w) => w.trackId),
    );
    const max = settings.maxTrackDurationSec;
    const items: SuggestionView[] = [];
    const seen = new Set<string>();
    const songsSeen = new Set<string>();
    for (const p of picks) {
      // The same song twice (often with a wrong artist the second time): keep the first.
      const songKey = normalizeQuery(p.song);
      if (songsSeen.has(songKey)) continue;
      songsSeen.add(songKey);
      const t = await this.findKnown(p.artist, p.song);
      if (
        t &&
        !seen.has(t.id) &&
        !waiting.has(t.id) &&
        (max === 0 || t.durationSec === null || t.durationSec <= max)
      ) {
        seen.add(t.id);
        items.push({ kind: 'track', track: toTrackSummary(t), reason: 'dj' });
      } else if (!t) {
        items.push({
          kind: 'search',
          artist: p.artist,
          song: p.song,
          reason: 'dj',
        });
      }
    }
    return items;
  }

  /** Exact artist + song first, then a title containing both (accents and case ignored). */
  private async findKnown(artist: string, song: string): Promise<Track | null> {
    const a = normalizeQuery(artist);
    const s = normalizeQuery(song);
    const base = { embeddable: true, title: { not: '' } };
    return (
      (await this.prisma.track.findFirst({
        where: { ...base, artistKey: a, songKey: s },
      })) ??
      (await this.prisma.track.findFirst({
        where: {
          ...base,
          searchKey: { contains: s },
          AND: [{ searchKey: { contains: a } }],
        },
        orderBy: { fetchedAt: 'desc' },
      }))
    );
  }
}
