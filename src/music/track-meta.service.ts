import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { normalizeQuery } from '../contracts';
import type { Track } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LastFmService } from './lastfm.service';
import { parseTitle } from './title-parser';

const EVERY_MS = 20_000;
const BATCH = 20;

type Meta = {
  artist: string | null;
  song: string | null;
  source: 'rules' | 'guess' | 'lastfm' | 'ai';
};

const AI_SYSTEM = `You read YouTube music video titles (many are Vietnamese) and give the main artist and the song name.
Answer only JSON: {"items":[{"i":<number>,"artist":<string|null>,"song":<string|null>}]}.
- Keep the original spelling, including Vietnamese accents.
- artist: the main performer only, without "ft." / "feat." guests.
- song: the song name only, without "Official MV", "Lyrics", "Remix" labels in brackets unless they are part of the name.
- Use null for both when the video is not one song (playlist, compilation, mix, radio stream, film, podcast).`;

/**
 * AI1: artist and song for every track, in the background so adding a song never waits.
 * Rules first; Last.fm confirms (and gives canonical spelling); AI handles what is left;
 * otherwise the rules' guess is kept.
 */
@Injectable()
export class TrackMetaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackMetaService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lastfm: LastFmService,
    private readonly ai: AiService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const tracks = await this.prisma.track.findMany({
        where: { metaAt: null, title: { not: '' } },
        orderBy: { fetchedAt: 'desc' },
        take: BATCH,
      });
      if (!tracks.length) return 0;
      const results = new Map<string, Meta>();
      const forAi: Track[] = [];
      for (const t of tracks) {
        const meta = await this.byRulesAndLastFm(t);
        if (meta.source === 'guess' && this.ai.enabled) forAi.push(t);
        results.set(t.id, meta);
      }
      for (const [id, meta] of await this.byAi(forAi)) results.set(id, meta);
      for (const [id, m] of results) {
        await this.prisma.track.update({
          where: { id },
          data: {
            artist: m.artist,
            song: m.song,
            artistKey: m.artist ? normalizeQuery(m.artist) : null,
            songKey: m.song ? normalizeQuery(m.song) : null,
            metaSource: m.source,
            metaAt: new Date(),
          },
        });
      }
      return tracks.length;
    } catch (e) {
      this.logger.warn(`track metadata pass failed: ${String(e)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async byRulesAndLastFm(t: Track): Promise<Meta> {
    const p = parseTitle(t.title, t.channel);
    if (this.lastfm.enabled && p.artist) {
      for (const c of [
        { artist: p.artist, song: p.song },
        ...(p.swapped ? [p.swapped] : []),
      ]) {
        const found = await this.lastfm.trackInfo(c.artist, c.song);
        if (found)
          return { artist: found.artist, song: found.song, source: 'lastfm' };
      }
    }
    return {
      artist: p.artist,
      song: p.song,
      source: p.confident ? 'rules' : 'guess',
    };
  }

  private async byAi(tracks: Track[]): Promise<Map<string, Meta>> {
    const out = new Map<string, Meta>();
    if (!tracks.length) return out;
    const answer = await this.ai.json<{
      items?: { i?: number; artist?: string | null; song?: string | null }[];
    }>(
      'track-meta',
      AI_SYSTEM,
      JSON.stringify(
        tracks.map((t, i) => ({ i, title: t.title, channel: t.channel })),
      ),
    );
    for (const item of answer?.items ?? []) {
      const t = typeof item.i === 'number' ? tracks[item.i] : undefined;
      if (!t) continue;
      const artist =
        typeof item.artist === 'string' && item.artist.trim()
          ? item.artist.trim().slice(0, 200)
          : null;
      const song =
        typeof item.song === 'string' && item.song.trim()
          ? item.song.trim().slice(0, 200)
          : null;
      out.set(t.id, { artist, song: artist ? song : null, source: 'ai' });
    }
    return out;
  }
}
