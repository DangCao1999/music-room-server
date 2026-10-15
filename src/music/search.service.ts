import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import {
  type CommandResults,
  normalizeQuery,
  type TrackSummary,
} from '../contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toTrackSummary } from '../state/views';
import {
  TrackCacheService,
  trackId,
  trackSearchKey,
} from './track-cache.service';
import { YouTubeProvider } from './youtube.provider';

type SearchResult = CommandResults['search:query'];

const DAY_MS = 24 * 3600_000;
/**
 * YouTube allows ~100 searches a day per project, so every saved call matters.
 * API data may be stored for at most 30 days (Developer Policies III.E.4): keep
 * search results 28 days and only answer from tracks fetched within that window.
 */
export const SEARCH_TTL_MS = 28 * DAY_MS;
export const LIBRARY_MAX_AGE_MS = 28 * DAY_MS;
/** A query that found nothing is retried after 6 h, not on every keystroke-and-enter. */
export const EMPTY_SEARCH_TTL_MS = 6 * 3600_000;
/** Enough known songs to skip YouTube; fewer and YouTube is asked as well. */
export const LIBRARY_MIN_HITS = 3;
export const SEARCH_LIMIT = { count: 10, windowMs: 3600_000 };

/**
 * Search, cheapest first (R-35):
 * 1. an earlier YouTube search for the same normalized words (free),
 * 2. songs this server already knows — added or found in the last 28 days (free),
 * 3. YouTube, at most once at a time per query (one search call).
 * `remote` skips step 2 when the user asks for "Tìm trên YouTube".
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  readonly limiter = new RateLimiter();
  private readonly inFlight = new Map<string, Promise<TrackSummary[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeProvider,
    private readonly tracks: TrackCacheService,
  ) {}

  /** Fill searchKey for tracks stored before the column existed. */
  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.track.findMany({
      where: { searchKey: null },
      select: { id: true, title: true, channel: true },
    });
    for (const r of rows) {
      await this.prisma.track.update({
        where: { id: r.id },
        data: { searchKey: trackSearchKey(r.title, r.channel) },
      });
    }
    if (rows.length)
      this.logger.log(`Indexed ${rows.length} track(s) for library search`);
  }

  async search(
    memberId: string,
    q: string,
    remote = false,
  ): Promise<SearchResult> {
    const words = normalizeQuery(q);
    const key = `youtube:${words}`;

    const cached = await this.fromCache(key);
    if (cached) return { results: cached, source: 'cache' };

    if (!remote) {
      const known = await this.fromLibrary(words);
      if (
        known.length >= LIBRARY_MIN_HITS ||
        (known.length > 0 && !this.youtube.searchEnabled)
      ) {
        return { results: known, source: 'library' };
      }
    }

    if (!this.youtube.searchEnabled) throw new AppError('SEARCH_UNAVAILABLE');
    // Only real YouTube calls count against the per-member limit.
    const rl = this.limiter.hit(
      `search:${memberId}`,
      SEARCH_LIMIT.count,
      SEARCH_LIMIT.windowMs,
      Date.now(),
    );
    if (!rl.ok)
      throw new AppError('RATE_LIMITED', { seconds: rl.retryAfterSec });

    // Several people searching the same words at once share one call.
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.fromYouTube(key, q).finally(() =>
        this.inFlight.delete(key),
      );
      this.inFlight.set(key, pending);
    }
    return { results: await pending, source: 'youtube' };
  }

  private async fromCache(key: string): Promise<TrackSummary[] | null> {
    const cached = await this.prisma.searchCache.findUnique({ where: { key } });
    if (!cached) return null;
    const ttl = cached.trackIds.length ? SEARCH_TTL_MS : EMPTY_SEARCH_TTL_MS;
    if (Date.now() - cached.createdAt.getTime() >= ttl) return null;
    const rows = await this.prisma.track.findMany({
      where: { id: { in: cached.trackIds } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return (
      cached.trackIds
        .map((id) => byId.get(id))
        // Scrubbed by the retention job (video gone from YouTube): never show a blank row.
        .filter((r) => r !== undefined && r.title !== '')
        .map(toTrackSummary)
    );
  }

  /** Every word must appear in title or channel (accents and case ignored). */
  private async fromLibrary(words: string): Promise<TrackSummary[]> {
    const tokens = words.split(' ').filter(Boolean).slice(0, 8);
    if (!tokens.length) return [];
    const rows = await this.prisma.track.findMany({
      where: {
        embeddable: true,
        fetchedAt: { gte: new Date(Date.now() - LIBRARY_MAX_AGE_MS) },
        AND: tokens.map((t) => ({ searchKey: { contains: t } })),
      },
      orderBy: { fetchedAt: 'desc' },
      take: 10,
    });
    return rows.map(toTrackSummary);
  }

  private async fromYouTube(key: string, q: string): Promise<TrackSummary[]> {
    const infos = await this.youtube.search(q);
    const rows = await Promise.all(infos.map((i) => this.tracks.upsert(i)));
    const ids = infos.map((i) => trackId(i.externalId));
    // Empty results are cached too, for a shorter time (EMPTY_SEARCH_TTL_MS).
    await this.prisma.searchCache.upsert({
      where: { key },
      create: { key, trackIds: ids },
      update: { trackIds: ids, createdAt: new Date() },
    });
    return rows.map(toTrackSummary);
  }
}
