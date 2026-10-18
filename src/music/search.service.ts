import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import {
  cleanLine,
  type CommandResults,
  normalizeQuery,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
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
 * YouTube's own search (InnerTube, free; 1 unit to check the videos): its results are
 * kept as YouTube gave them. Used as is for 3 h; up to 24 h they are still shown at once
 * while a fresh search runs in the background for next time; "nothing found" (often a
 * fresh upload or a hiccup) is asked again after 30 min.
 */
export const INNERTUBE_FRESH_MS = 3 * 3600_000;
export const INNERTUBE_STALE_MS = 24 * 3600_000;
export const INNERTUBE_EMPTY_TTL_MS = 30 * 60_000;
/** Extra videos asked of YouTube per search: some turn out not embeddable once checked. */
const CHECK_SLACK = 6;

/** Search cache keys: Data API searches (100 units) and InnerTube searches. */
const apiKey = (words: string) => `youtube:${words}`;
/**
 * YouTube's own search, keyed by what was typed with its accents ("lạc trôi" and "lac
 * troi" give different results); only case and spaces are ignored.
 */
const innertubeKey = (q: string) =>
  `it2:${cleanLine(q).toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim()}`;
/**
 * Only while InnerTube cannot be used (each YouTube search then costs 100 units): this
 * many loosely matching known songs are still answered from the library, as before.
 */
export const LIBRARY_MIN_HITS = 3;
export const SEARCH_LIMIT = { count: 10, windowMs: 3600_000 };

/**
 * Song search (R-35, spec 2026-10-17-search, search cache 2026-10-17):
 * - YouTube's own search through InnerTube (free): its results exactly, in its order,
 *   SEARCH_PAGE_SIZE at a time ("Xem thêm" up to SEARCH_MAX_RESULTS), each page's
 *   videos checked through the Data API (1 unit) and cached per typed query.
 * - Only when InnerTube is off or failing: an earlier Data API search, songs this server
 *   already knows (when the match is sure), then the Data API search (100 units).
 * `remote` ("Tìm trên YouTube") skips the caches and the library.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  readonly limiter = new RateLimiter();
  private readonly inFlight = new Map<string, Promise<unknown>>();

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
    page = 0,
  ): Promise<SearchResult> {
    const words = normalizeQuery(q);
    if (!matchWords(words).length) return { results: [], source: 'library' };
    if (this.innertube.available) {
      try {
        return await this.youtubeSearch(q, remote, page);
      } catch (e) {
        this.logger.warn(
          `InnerTube search failed, using the fallback: ${String(e)}`,
        );
      }
    }
    // "Xem thêm" belongs to YouTube's own search only.
    if (page > 0) return { results: [], source: 'youtube', more: false };
    return this.fallbackSearch(memberId, q, words, remote);
  }

  /** An earlier YouTube search for the same query, in YouTube's order. Free. */
  async cached(q: string): Promise<TrackSummary[] | null> {
    const hit = await this.prisma.searchCache.findUnique({
      where: { key: innertubeKey(q) },
    });
    if (hit && this.age(hit) < this.maxAge(hit)) return this.rows(hit.trackIds);
    return this.fromApiCache(normalizeQuery(q));
  }

  // ------------------------------------------------------------ YouTube's own search

  private async youtubeSearch(
    q: string,
    remote: boolean,
    page: number,
  ): Promise<SearchResult> {
    const key = innertubeKey(q);
    const from = page * SEARCH_PAGE_SIZE;
    const need = Math.min(SEARCH_MAX_RESULTS, from + SEARCH_PAGE_SIZE);
    // The pages already shown stay as they are: YouTube reorders a few neighbours between
    // two searches, and "Xem thêm" must never repeat or skip a song.
    let shown: string[] = [];
    // "Tìm trên YouTube" asks afresh for its first page; its "Xem thêm" continues that list.
    if (!remote || page > 0) {
      const hit = await this.prisma.searchCache.findUnique({ where: { key } });
      const young = hit !== null && this.age(hit) < this.maxAge(hit);
      // Long enough for this page, or YouTube had no more.
      if (young && (hit.trackIds.length >= need || !hit.more)) {
        if (hit.trackIds.length && this.age(hit) >= INNERTUBE_FRESH_MS)
          this.refreshInBackground(key, q, hit.trackIds.length);
        const rows = await this.rows(hit.trackIds);
        return {
          results: rows.slice(from, need),
          source: 'cache',
          more: need < SEARCH_MAX_RESULTS && (rows.length > need || hit.more),
        };
      }
      if (young && page > 0) shown = hit.trackIds.slice(0, from);
    }
    const got = await this.shared(`${key}#${need}`, () =>
      this.fetchInnerTube(key, q, need, shown),
    );
    return {
      results: got.tracks.slice(from, need),
      source: 'youtube',
      more: need < SEARCH_MAX_RESULTS && got.more,
    };
  }

  /**
   * The first `need` songs YouTube finds, checked (embeddable, not live) and cached with
   * whether YouTube has more. Unchecked (no API key / quota resting): shown, not cached.
   */
  private async fetchInnerTube(
    key: string,
    q: string,
    need: number,
    shown: string[] = [],
  ): Promise<{ tracks: TrackSummary[]; more: boolean }> {
    const found = await this.innertube.search(q, need + CHECK_SLACK);
    if (!found.videos.length) {
      this.logger.log(`search "${q}" via innertube (nothing found)`);
      await this.remember(key, [], false);
      return { tracks: [], more: false };
    }
    const checked = await this.youtube.checkVideos(
      found.videos.map((f) => f.externalId),
    );
    if (!checked) {
      this.logger.log(`search "${q}" via innertube (unchecked)`);
      return {
        tracks: found.videos.slice(0, need).map(foundToSummary),
        more: found.more || found.videos.length > need,
      };
    }
    // Pages already shown first, then YouTube's next songs in its order.
    const seen = new Set(shown);
    const fresh = checked.filter((c) => !seen.has(trackId(c.externalId)));
    const ids = [...shown, ...fresh.map((c) => trackId(c.externalId))];
    const more = found.more || ids.length > need;
    this.logger.log(`search "${q}" via innertube+videos (1 unit), ${need}`);
    await Promise.all(fresh.map((c) => this.tracks.upsert(c)));
    await this.remember(key, ids.slice(0, need), more);
    return { tracks: await this.rows(ids.slice(0, need)), more };
  }

  /** Shown from the cache (3–24 h old): ask YouTube again, quietly, for next time. */
  private refreshInBackground(key: string, q: string, count: number): void {
    const need = Math.min(
      SEARCH_MAX_RESULTS,
      Math.max(SEARCH_PAGE_SIZE, count),
    );
    void this.shared(`${key}#${need}`, () =>
      this.fetchInnerTube(key, q, need),
    ).catch((e: unknown) =>
      this.logger.warn(`Refreshing search "${q}" failed: ${String(e)}`),
    );
  }

  /** Several people searching the same thing at once share one search. */
  private shared<T>(id: string, run: () => Promise<T>): Promise<T> {
    let pending = this.inFlight.get(id) as Promise<T> | undefined;
    if (!pending) {
      pending = run().finally(() => this.inFlight.delete(id));
      this.inFlight.set(id, pending);
    }
    return pending;
  }

  private age(hit: { createdAt: Date }): number {
    return Date.now() - hit.createdAt.getTime();
  }

  private maxAge(hit: { trackIds: string[] }): number {
    return hit.trackIds.length ? INNERTUBE_STALE_MS : INNERTUBE_EMPTY_TTL_MS;
  }

  /** Cached ids → rows, in the cached order (scrubbed videos skipped, never blank rows). */
  private async rows(ids: string[]): Promise<TrackSummary[]> {
    const rows = await this.prisma.track.findMany({
      where: { id: { in: ids } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r) => r !== undefined && r.title !== '')
      .map(toTrackSummary);
  }

  // ------------------------------------------------------------ fallback (no InnerTube)

  /**
   * InnerTube off or failing: an earlier Data API search, the library when it is sure,
   * then the Data API search (100 units, limited per member).
   */
  private async fallbackSearch(
    memberId: string,
    q: string,
    words: string,
    remote: boolean,
  ): Promise<SearchResult> {
    const key = apiKey(words);
    const cached = remote ? null : await this.fromApiCache(words);
    if (cached) return { results: cached, source: 'cache', more: false };

    const hasApi = this.youtube.searchEnabled;
    let lib: Awaited<ReturnType<SearchService['rankLibrary']>> | null = null;
    // The old stop-at-library rule (substring hits): every Data API search costs 100
    // units, so quota never goes up — showing the better ranking.
    const oldRule = async (): Promise<TrackSummary[] | null> => {
      if (remote || !lib) return null;
      const old = await this.fromLibrary(words);
      if (old.length >= LIBRARY_MIN_HITS || (old.length > 0 && !hasApi))
        return lib.results.length ? lib.results : old;
      return null;
    };
    if (!remote) {
      lib = await this.rankLibrary(q);
      if (lib.strong)
        return { results: lib.results, source: 'library', more: false };
      const known = await oldRule();
      if (known) return { results: known, source: 'library', more: false };
    }
    if (!hasApi) {
      // YouTube unreachable right now: what the library has beats an error.
      if (lib?.results.length)
        return { results: lib.results, source: 'library', more: false };
      throw new AppError('SEARCH_UNAVAILABLE');
    }
    try {
      const results = await this.shared(key, () =>
        this.apiSearch(key, q, memberId),
      );
      return { results, source: 'youtube', more: false };
    } catch (e) {
      if (lib?.results.length)
        return { results: lib.results, source: 'library', more: false };
      throw e;
    }
  }

  private fromApiCache(words: string): Promise<TrackSummary[] | null> {
    return this.fromCache(apiKey(words), SEARCH_TTL_MS, EMPTY_SEARCH_TTL_MS);
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

  /** The Data API search: 100 units, so limited per member. */
  private async apiSearch(
    key: string,
    q: string,
    memberId: string,
  ): Promise<TrackSummary[]> {
    const rl = this.limiter.hit(
      `search:${memberId}`,
      SEARCH_LIMIT.count,
      SEARCH_LIMIT.windowMs,
      Date.now(),
    );
    if (!rl.ok)
      throw new AppError('RATE_LIMITED', { seconds: rl.retryAfterSec });
    this.logger.log(`search "${q}" via api (100 units)`);
    return this.store(key, await this.youtube.search(q), false);
  }

  /** Remember checked results: the tracks in the library, the order in the search cache. */
  private async store(
    key: string,
    infos: TrackInfo[],
    more: boolean,
  ): Promise<TrackSummary[]> {
    const rows = await Promise.all(infos.map((i) => this.tracks.upsert(i)));
    await this.remember(
      key,
      infos.map((i) => trackId(i.externalId)),
      more,
    );
    return rows.map(toTrackSummary);
  }

  /** The order a search gave (empty too, kept for a shorter time) and whether YouTube had more. */
  private async remember(
    key: string,
    ids: string[],
    more: boolean,
  ): Promise<void> {
    await this.prisma.searchCache.upsert({
      where: { key },
      create: { key, trackIds: ids, more },
      update: { trackIds: ids, more, createdAt: new Date() },
    });
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
