import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import { normalizeQuery, type TrackSummary } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';
import { toTrackSummary } from '../state/views';
import { TrackCacheService, trackId } from './track-cache.service';
import { YouTubeProvider } from './youtube.provider';

export const SEARCH_TTL_MS = 24 * 3600_000;
export const SEARCH_LIMIT = { count: 10, windowMs: 3600_000 };

/** Search with a 24 h cache keyed by the normalized query (R-35). */
@Injectable()
export class SearchService {
  readonly limiter = new RateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeProvider,
    private readonly tracks: TrackCacheService,
  ) {}

  async search(memberId: string, q: string): Promise<TrackSummary[]> {
    if (!this.youtube.searchEnabled) throw new AppError('SEARCH_UNAVAILABLE');
    const rl = this.limiter.hit(
      `search:${memberId}`,
      SEARCH_LIMIT.count,
      SEARCH_LIMIT.windowMs,
      Date.now(),
    );
    if (!rl.ok)
      throw new AppError('RATE_LIMITED', { seconds: rl.retryAfterSec });

    const key = `youtube:${normalizeQuery(q)}`;
    const cached = await this.prisma.searchCache.findUnique({ where: { key } });
    if (cached && Date.now() - cached.createdAt.getTime() < SEARCH_TTL_MS) {
      const rows = await this.prisma.track.findMany({
        where: { id: { in: cached.trackIds } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return cached.trackIds
        .map((id) => byId.get(id))
        .filter((r) => r !== undefined)
        .map(toTrackSummary);
    }

    const infos = await this.youtube.search(q);
    const rows = await Promise.all(infos.map((i) => this.tracks.upsert(i)));
    const ids = infos.map((i) => trackId(i.externalId));
    // Empty results are not cached: a query that finds nothing now may find
    // something after a new upload, and it costs nothing to keep the slot free.
    if (ids.length > 0) {
      await this.prisma.searchCache.upsert({
        where: { key },
        create: { key, trackIds: ids },
        update: { trackIds: ids, createdAt: new Date() },
      });
    }
    return rows.map(toTrackSummary);
  }
}
