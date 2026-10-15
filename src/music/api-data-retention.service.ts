import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_TTL_MS } from './search.service';
import { TrackCacheService } from './track-cache.service';
import { YouTubeProvider } from './youtube.provider';

const DAY_MS = 24 * 3600_000;
/** Refresh before the 30-day limit is reached (Developer Policies III.E.4). */
export const TRACK_REFRESH_AFTER_MS = 25 * DAY_MS;
export const API_DATA_MAX_AGE_MS = 30 * DAY_MS;
const RUN_EVERY_MS = DAY_MS;
const FIRST_RUN_AFTER_MS = 60_000;
/** One videos.list call per 50 ids (1 quota unit); a day's run stays small. */
const MAX_REFRESH_PER_RUN = 1_000;

/**
 * YouTube API data may be kept for at most 30 days, then deleted or refreshed.
 * Once a day:
 * - expired search results are deleted (they are no longer used after 28 days);
 * - tracks older than 25 days are re-fetched in batches of 50. Videos YouTube no
 *   longer returns (deleted, private) are scrubbed: the id stays so history keeps
 *   pointing at something, the title, channel and artwork go.
 * - Without a usable API key nothing can be refreshed, so tracks past 30 days are
 *   scrubbed instead — except ones still waiting in a queue or playing.
 */
@Injectable()
export class ApiDataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiDataRetentionService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeProvider,
    private readonly tracks: TrackCacheService,
  ) {}

  onModuleInit(): void {
    // After boot settles; then daily. unref(): never keeps the process alive.
    this.timers.push(
      setTimeout(() => void this.run(), FIRST_RUN_AFTER_MS).unref(),
    );
    this.timers.push(setInterval(() => void this.run(), RUN_EVERY_MS).unref());
  }

  onModuleDestroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
  }

  async run(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const searches = await this.prisma.searchCache.deleteMany({
        where: { createdAt: { lt: new Date(now - SEARCH_TTL_MS) } },
      });
      const { refreshed, scrubbed } = this.youtube.apiUsable
        ? await this.refreshStaleTracks(now)
        : { refreshed: 0, scrubbed: await this.scrubExpiredTracks(now) };
      if (searches.count || refreshed || scrubbed) {
        this.logger.log(
          `API data retention: ${searches.count} search result(s) deleted, ${refreshed} track(s) refreshed, ${scrubbed} scrubbed`,
        );
      }
    } catch (e) {
      // Quota errors and outages: try again tomorrow; nothing here is urgent.
      this.logger.warn(`API data retention skipped: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async refreshStaleTracks(
    now: number,
  ): Promise<{ refreshed: number; scrubbed: number }> {
    const stale = await this.prisma.track.findMany({
      where: {
        fetchedAt: { lt: new Date(now - TRACK_REFRESH_AFTER_MS) },
        title: { not: '' }, // already scrubbed
      },
      select: { id: true, externalId: true },
      orderBy: { fetchedAt: 'asc' },
      take: MAX_REFRESH_PER_RUN,
    });
    if (!stale.length) return { refreshed: 0, scrubbed: 0 };
    const found = await this.youtube.videos(stale.map((t) => t.externalId));
    let refreshed = 0;
    const gone: string[] = [];
    for (const t of stale) {
      const info = found.get(t.externalId);
      if (info) {
        await this.tracks.upsert(info);
        refreshed++;
      } else {
        gone.push(t.id);
      }
    }
    return { refreshed, scrubbed: await this.scrub(gone) };
  }

  private async scrubExpiredTracks(now: number): Promise<number> {
    const expired = await this.prisma.track.findMany({
      where: {
        fetchedAt: { lt: new Date(now - API_DATA_MAX_AGE_MS) },
        title: { not: '' },
      },
      select: { id: true },
    });
    return this.scrub(expired.map((t) => t.id));
  }

  private async scrub(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const r = await this.prisma.track.updateMany({
      where: {
        id: { in: ids },
        // Songs someone is waiting for keep their title until they play.
        queueItems: { none: { status: { in: ['QUEUED', 'PLAYING'] } } },
      },
      data: {
        title: '',
        channel: null,
        thumbnailUrl: null,
        durationSec: null,
        searchKey: null,
        embeddable: false,
      },
    });
    return r.count;
  }
}
