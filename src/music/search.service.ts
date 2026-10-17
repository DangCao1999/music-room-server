import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import {
  type CommandResults,
  normalizeQuery,
  type TrackSummary,
} from '../contracts';
import { PrismaService } from '../prisma/prisma.service';
import { type FoundVideo, InnerTubeProvider } from './innertube.provider';
import { isConfident, matchWords, scoreTrack } from './library-match';
import { toTrackSummary } from '../state/views';
import {
  TrackCacheService,
  trackId,
  trackSearchKey,
} from './track-cache.service';
import { type TrackInfo, YouTubeProvider } from './youtube.provider';

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
/**
 * InnerTube searches cost 1 unit: keep them only a few hours so new uploads show up
 * soon; "nothing found" is more often temporary (a fresh upload, a hiccup) → 1 h.
 */
export const INNERTUBE_SEARCH_TTL_MS = 3 * 3600_000;
export const INNERTUBE_EMPTY_TTL_MS = 3600_000;

/** Search cache keys: Data API searches (100 units) and InnerTube searches. */
const apiKey = (words: string) => `youtube:${words}`;
const innertubeKey = (words: string) => `it:${words}`;
/**
 * Only while InnerTube cannot be used (each YouTube search then costs 100 units): this
 * many loosely matching known songs are still answered from the library, as before.
 */
export const LIBRARY_MIN_HITS = 3;
export const SEARCH_LIMIT = { count: 10, windowMs: 3600_000 };

/**
 * Search, cheapest first (R-35, spec 2026-10-17-search):
 * 1. an earlier YouTube search for the same normalized words (free),
 * 2. songs this server already knows, ranked by how well they match — answered only
 *    when the match is sure (free),
 * 3. YouTube, at most once at a time per query: InnerTube (no quota) checked through
 *    the Data API (1 unit), else the Data API search (100 units).
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
    private readonly innertube: InnerTubeProvider,
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
    const key = apiKey(words);

    if (!matchWords(words).length) return { results: [], source: 'library' };

    const innertube = this.innertube.available;
    // With InnerTube a fresh search is cheap: only its own recent results are reused,
    // and "Tìm trên YouTube" (remote) always asks again. Without it, any earlier result.
    const cached = innertube
      ? remote
        ? null
        : await this.fromInnerTubeCache(words)
      : ((await this.fromApiCache(words)) ??
        (await this.fromInnerTubeCache(words)));
    if (cached) return { results: cached, source: 'cache' };

    const hasApi = this.youtube.searchEnabled;
    let lib: Awaited<ReturnType<SearchService['rankLibrary']>> | null = null;
    // The old stop-at-library rule (substring hits): applied whenever a YouTube search
    // would cost 100 units, so quota never goes up — showing the better ranking.
    const oldRule = async (): Promise<TrackSummary[] | null> => {
      if (remote || !lib) return null;
      const old = await this.fromLibrary(words);
      if (old.length >= LIBRARY_MIN_HITS || (old.length > 0 && !hasApi))
        return lib.results.length ? lib.results : old;
      return null;
    };
    if (!remote) {
      lib = await this.rankLibrary(q);
      if (lib.strong) return { results: lib.results, source: 'library' };
      if (!innertube) {
        const known = await oldRule();
        if (known) return { results: known, source: 'library' };
      }
    }

    if (!innertube && !hasApi) throw new AppError('SEARCH_UNAVAILABLE');

    // Several people searching the same words at once share one search.
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.fromYouTube(key, q, memberId, oldRule).finally(() =>
        this.inFlight.delete(key),
      );
      this.inFlight.set(key, pending);
    }
    try {
      return { results: await pending, source: 'youtube' };
    } catch (e) {
      // YouTube unreachable right now: what the library has beats an error.
      if (lib?.results.length)
        return { results: lib.results, source: 'library' };
      throw e;
    }
  }

  /** An earlier YouTube search for the same words, in YouTube's order. Free. */
  async cached(q: string): Promise<TrackSummary[] | null> {
    const words = normalizeQuery(q);
    return (
      (await this.fromInnerTubeCache(words)) ?? (await this.fromApiCache(words))
    );
  }

  private fromApiCache(words: string): Promise<TrackSummary[] | null> {
    return this.fromCache(apiKey(words), SEARCH_TTL_MS, EMPTY_SEARCH_TTL_MS);
  }

  private fromInnerTubeCache(words: string): Promise<TrackSummary[] | null> {
    return this.fromCache(
      innertubeKey(words),
      INNERTUBE_SEARCH_TTL_MS,
      INNERTUBE_EMPTY_TTL_MS,
    );
  }

  private async fromCache(
    key: string,
    ttlMs: number,
    emptyTtlMs: number,
  ): Promise<TrackSummary[] | null> {
    const cached = await this.prisma.searchCache.findUnique({ where: { key } });
    if (!cached) return null;
    const ttl = cached.trackIds.length ? ttlMs : emptyTtlMs;
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

  /** Every word must appear in title or channel (accents and case ignored). Free. */
  async fromLibrary(words: string): Promise<TrackSummary[]> {
    const tokens = matchWords(words).slice(0, 8);
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

  /**
   * The library ranked by how well each song matches what was typed (whole words, the
   * accented phrase first). `strong`: sure enough to skip YouTube. Free.
   */
  async rankLibrary(
    q: string,
  ): Promise<{ results: TrackSummary[]; strong: boolean; total: number }> {
    const words = normalizeQuery(q);
    // Same word split as the scoring (punctuation, % and _ never reach LIKE).
    const tokens = matchWords(words).slice(0, 8);
    if (!tokens.length) return { results: [], strong: false, total: 0 };
    // Broad candidates (substring on the accent-free key), then whole-word scoring here.
    const rows = await this.prisma.track.findMany({
      where: {
        embeddable: true,
        fetchedAt: { gte: new Date(Date.now() - LIBRARY_MAX_AGE_MS) },
        AND: tokens.map((t) => ({ searchKey: { contains: t } })),
      },
      orderBy: { fetchedAt: 'desc' },
      take: 300,
    });
    const scored = rows
      .map((r) => ({ r, score: scoreTrack(r.title, r.channel, q) }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.r.title.length - b.r.title.length ||
          b.r.fetchedAt.getTime() - a.r.fetchedAt.getTime(),
      );
    return {
      results: scored.slice(0, 10).map((x) => toTrackSummary(x.r)),
      strong: isConfident(
        scored.map((x) => x.score),
        matchWords(words).length,
      ),
      total: scored.length,
    };
  }

  private async fromYouTube(
    key: string,
    q: string,
    memberId: string,
    beforeApi: () => Promise<TrackSummary[] | null>,
  ): Promise<TrackSummary[]> {
    if (this.innertube.available) {
      let found: FoundVideo[] | null = null;
      try {
        found = await this.innertube.search(q);
      } catch (e) {
        this.logger.warn(
          `InnerTube search failed, using the Data API: ${String(e)}`,
        );
      }
      const itKey = key.replace(/^youtube:/, 'it:');
      // YouTube's own search found nothing: the Data API search (same index, 100
      // units) would not either. Remembered for INNERTUBE_EMPTY_TTL_MS.
      if (found?.length === 0) {
        this.logger.log(`search "${q}" via innertube (nothing found)`);
        return this.store(itKey, []);
      }
      if (found?.length) {
        const checked = await this.youtube.checkVideos(
          found.map((f) => f.externalId),
        );
        if (checked) {
          this.logger.log(`search "${q}" via innertube+videos (1 unit)`);
          return this.store(itKey, checked);
        }
        // Not checked (no key / quota resting): shown for this search only, never stored.
        this.logger.log(`search "${q}" via innertube (unchecked)`);
        return found.map(foundToSummary);
      }
    }

    if (!this.youtube.searchEnabled) throw new AppError('SEARCH_UNAVAILABLE');
    // About to spend 100 units: the old rule may still answer from the library.
    const known = await beforeApi();
    if (known) return known;
    // Only Data API searches (100 units) count against the per-member limit.
    const rl = this.limiter.hit(
      `search:${memberId}`,
      SEARCH_LIMIT.count,
      SEARCH_LIMIT.windowMs,
      Date.now(),
    );
    if (!rl.ok)
      throw new AppError('RATE_LIMITED', { seconds: rl.retryAfterSec });
    this.logger.log(`search "${q}" via api (100 units)`);
    return this.store(key, await this.youtube.search(q));
  }

  /** Remember checked results: the tracks in the library, the order in the search cache. */
  private async store(
    key: string,
    infos: TrackInfo[],
  ): Promise<TrackSummary[]> {
    const rows = await Promise.all(infos.map((i) => this.tracks.upsert(i)));
    const ids = infos.map((i) => trackId(i.externalId));
    // Empty results are cached too, for a shorter time (…EMPTY…_TTL_MS).
    await this.prisma.searchCache.upsert({
      where: { key },
      create: { key, trackIds: ids },
      update: { trackIds: ids, createdAt: new Date() },
    });
    return rows.map(toTrackSummary);
  }
}

/** An unchecked InnerTube result shown as a search row. */
function foundToSummary(f: FoundVideo): TrackSummary {
  return {
    id: trackId(f.externalId),
    provider: 'youtube',
    externalId: f.externalId,
    title: f.title,
    channel: f.channel,
    durationSec: f.durationSec,
    thumbnailUrl: f.thumbnailUrl,
    artist: null,
    song: null,
  };
}
