import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import type { LyricsView } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';
import { parseTitle } from './title-parser';

/**
 * A7: lyrics from LRCLIB (free, no key). Kept only in memory — lyrics belong to their
 * writers, so they are passed through, never stored in the database.
 */

const API = 'https://lrclib.net/api/search';
const TIMEOUT_MS = 6000;
const FOUND_MS = 6 * 3600_000;
const MISSING_MS = 3600_000;
const CACHE_MAX = 500;

interface LrcLibHit {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** "[01:02.34] line" (several stamps per line allowed) → sorted lines with seconds. */
export function parseLrc(lrc: string): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps)
      out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

@Injectable()
export class LyricsService {
  private readonly logger = new Logger(LyricsService.name);
  private readonly cache = new Map<
    string,
    { at: number; value: LyricsView | null }
  >();
  /** LRCLIB answered 429 twice: wait before asking again. */
  private restingUntil = 0;
  /** One LRCLIB request per song, however many devices ask at the same moment. */
  private readonly inFlight = new Map<string, Promise<LyricsView | null>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lyrics, or null when LRCLIB has none. Throws RATE_LIMITED when LRCLIB cannot be
   * asked right now, so the device tries again later instead of hiding lyrics for good.
   */
  async forTrack(trackId: string): Promise<LyricsView | null> {
    const hit = this.cache.get(trackId);
    if (hit && Date.now() - hit.at < (hit.value ? FOUND_MS : MISSING_MS))
      return hit.value;
    let pending = this.inFlight.get(trackId);
    if (!pending) {
      pending = this.load(trackId).finally(() => this.inFlight.delete(trackId));
      this.inFlight.set(trackId, pending);
    }
    return pending;
  }

  private async load(trackId: string): Promise<LyricsView | null> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });
    if (!track || track.title === '') return null;
    let artist = track.artist;
    let song = track.song;
    if (!artist || !song) {
      const p = parseTitle(track.title, track.channel);
      artist = artist ?? p.artist;
      song = song ?? p.song;
    }
    let value: LyricsView | null;
    try {
      value = await this.fetch(artist, song, track.durationSec);
    } catch (e) {
      // Network trouble or 429: not remembered as "no lyrics".
      this.logger.warn(`LRCLIB failed for ${trackId}: ${String(e)}`);
      throw new AppError('RATE_LIMITED', { seconds: 60 });
    }
    if (this.cache.size >= CACHE_MAX)
      this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(trackId, { at: Date.now(), value });
    return value;
  }

  private async fetch(
    artist: string | null,
    song: string,
    duration: number | null,
  ): Promise<LyricsView | null> {
    if (Date.now() < this.restingUntil) throw new Error('resting after 429');
    const url = new URL(API);
    if (artist) {
      url.searchParams.set('track_name', song);
      url.searchParams.set('artist_name', artist);
    } else {
      url.searchParams.set('q', song);
    }
    const get = () =>
      fetch(url, {
        headers: { 'user-agent': 'MusicRoom/1.0 (office shared music)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let res = await get();
    // LRCLIB throttles bursts: one more try after a short pause, then rest a minute.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await get();
    }
    if (res.status === 429) this.restingUntil = Date.now() + 60_000;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hits = ((await res.json()) as LrcLibHit[]).filter(
      (h) => !h.instrumental && (h.syncedLyrics || h.plainLyrics),
    );
    if (!hits.length) return null;
    // Prefer synced lyrics, then the closest length; a length far off is another recording.
    const score = (h: LrcLibHit) => {
      const off = duration && h.duration ? Math.abs(h.duration - duration) : 0;
      return (h.syncedLyrics ? 0 : 20) + (off > 5 ? 50 + off : off);
    };
    const best = hits.sort((a, b) => score(a) - score(b))[0];
    if (duration && best.duration && Math.abs(best.duration - duration) > 15)
      return null;
    const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
    return {
      synced: synced && synced.length ? synced : null,
      plain: best.plainLyrics?.trim() || null,
    };
  }
}
