import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { parseIsoDuration } from './iso-duration';

export interface TrackInfo {
  externalId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  embeddable: boolean;
  live: boolean;
}

const API = 'https://www.googleapis.com/youtube/v3';
const OEMBED = 'https://www.youtube.com/oembed';
export const HTTP_TIMEOUT_MS = 5000;
const QUOTA_BACKOFF_MS = 60 * 60_000;

type Fetch = typeof fetch;
type Result = { status: number; body: unknown };

class QuotaError extends Error {}
class KeyError extends Error {}

interface VideoItem {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean };
}

/**
 * YouTube Data API v3 with oEmbed fallback (R-36), 5 s timeout and one retry on
 * network errors / 5xx (R-37). Quota and invalid-key states are remembered so we
 * stop hammering the API.
 */
@Injectable()
export class YouTubeProvider {
  private readonly logger = new Logger(YouTubeProvider.name);
  private quotaUntil = 0;
  private keyInvalid = false;
  /** Overridable in tests. */
  fetchImpl: Fetch = (input: string | URL | Request, init?: RequestInit) =>
    fetch(input, init);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get searchEnabled(): boolean {
    if (this.env.YOUTUBE_FAKE) return true;
    return Boolean(this.env.YOUTUBE_API_KEY) && !this.keyInvalid;
  }

  /**
   * YOUTUBE_FAKE: deterministic 5-minute tracks so dev/E2E never call YouTube. Long enough
   * that the server-side advance timer never fires during a test on a slow CI runner.
   */
  private fake(videoId: string): TrackInfo {
    return {
      externalId: videoId,
      title: `Bài thử ${videoId}`,
      channel: 'Music Room',
      durationSec: 300,
      thumbnailUrl: null,
      embeddable: true,
      live: false,
    };
  }

  private get apiUsable(): boolean {
    return this.searchEnabled && Date.now() >= this.quotaUntil;
  }

  // ---------------------------------------------------------------- HTTP

  private async request(url: string): Promise<Result> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(url, { signal: ctrl.signal });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        if (res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }
        return { status: res.status, body };
      } catch (e) {
        lastError = e;
      } finally {
        clearTimeout(timer);
      }
      if (attempt === 0)
        this.logger.warn(`YouTube request failed, retrying once`);
    }
    throw new AppError('INTERNAL', { cause: String(lastError) });
  }

  private async api(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const qs = new URLSearchParams({
      ...params,
      key: this.env.YOUTUBE_API_KEY ?? '',
    });
    const { status, body } = await this.request(
      `${API}/${path}?${qs.toString()}`,
    );
    if (status === 200) return body;
    const reason = (
      body as {
        error?: { errors?: { reason?: string }[]; message?: string };
      } | null
    )?.error;
    const r = reason?.errors?.[0]?.reason ?? '';
    if (
      r === 'quotaExceeded' ||
      r === 'dailyLimitExceeded' ||
      r === 'rateLimitExceeded'
    ) {
      this.quotaUntil = Date.now() + QUOTA_BACKOFF_MS;
      this.logger.warn('YouTube API quota exceeded — falling back for 1h');
      throw new QuotaError();
    }
    if (
      r === 'keyInvalid' ||
      (status === 400 && /API key/i.test(reason?.message ?? ''))
    ) {
      if (!this.keyInvalid) this.logger.error('YOUTUBE_API_KEY không hợp lệ');
      this.keyInvalid = true;
      throw new KeyError();
    }
    throw new AppError('INTERNAL', { status });
  }

  // ---------------------------------------------------------------- mapping

  private toInfo(v: VideoItem): TrackInfo {
    const thumbs = v.snippet?.thumbnails ?? {};
    const duration = parseIsoDuration(v.contentDetails?.duration ?? '');
    const live = ['live', 'upcoming'].includes(
      v.snippet?.liveBroadcastContent ?? '',
    );
    return {
      externalId: v.id,
      title: v.snippet?.title ?? v.id,
      channel: v.snippet?.channelTitle ?? null,
      durationSec: duration && duration > 0 ? duration : null,
      thumbnailUrl:
        thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null,
      embeddable: v.status?.embeddable !== false,
      live,
    };
  }

  /** Data API lookup, up to 50 ids per call (1 quota unit). */
  async videos(ids: string[]): Promise<Map<string, TrackInfo>> {
    const out = new Map<string, TrackInfo>();
    for (let i = 0; i < ids.length; i += 50) {
      const body = (await this.api('videos', {
        part: 'snippet,contentDetails,status',
        id: ids.slice(i, i + 50).join(','),
        maxResults: '50',
      })) as { items?: VideoItem[] };
      for (const v of body.items ?? []) out.set(v.id, this.toInfo(v));
    }
    return out;
  }

  private async oembed(videoId: string): Promise<TrackInfo> {
    const qs = new URLSearchParams({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      format: 'json',
    });
    const { status, body } = await this.request(`${OEMBED}?${qs.toString()}`);
    if (status === 401 || status === 403)
      throw new AppError('TRACK_NOT_EMBEDDABLE');
    if (status === 404 || status === 400) throw new AppError('TRACK_NOT_FOUND');
    if (status !== 200 || !body || typeof body !== 'object') {
      throw new AppError('INTERNAL', { status });
    }
    const o = body as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      externalId: videoId,
      title: o.title ?? videoId,
      channel: o.author_name ?? null,
      durationSec: null,
      thumbnailUrl: o.thumbnail_url ?? null,
      embeddable: true,
      live: false,
    };
  }

  // ---------------------------------------------------------------- public

  /** Metadata for one video: Data API, else oEmbed (no key / quota / API failure). */
  async getTrack(videoId: string): Promise<TrackInfo> {
    if (this.env.YOUTUBE_FAKE) return this.fake(videoId);
    if (this.apiUsable) {
      try {
        const found = (await this.videos([videoId])).get(videoId);
        if (!found) throw new AppError('TRACK_NOT_FOUND');
        return found;
      } catch (e) {
        if (e instanceof AppError && e.code !== 'INTERNAL') throw e;
        // quota / invalid key / outage → oEmbed below
      }
    }
    return this.oembed(videoId);
  }

  /** Up to 10 embeddable, non-live videos (R-35). */
  async search(q: string): Promise<TrackInfo[]> {
    if (this.env.YOUTUBE_FAKE) {
      return Array.from({ length: 5 }, (_, i) =>
        this.fake(
          `Fake${String(i).padStart(3, '0')}${q.length.toString().padStart(4, '0')}`,
        ),
      );
    }
    if (!this.searchEnabled) throw new AppError('SEARCH_UNAVAILABLE');
    if (!this.apiUsable) throw new AppError('QUOTA_EXCEEDED');
    try {
      const body = (await this.api('search', {
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true',
        maxResults: '10',
        q,
      })) as { items?: { id?: { videoId?: string } }[] };
      const ids = (body.items ?? [])
        .map((i) => i.id?.videoId)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) return [];
      const infos = await this.videos(ids);
      return ids
        .map((id) => infos.get(id))
        .filter((t): t is TrackInfo => Boolean(t && t.embeddable && !t.live));
    } catch (e) {
      if (e instanceof QuotaError) throw new AppError('QUOTA_EXCEEDED');
      if (e instanceof KeyError) throw new AppError('SEARCH_UNAVAILABLE');
      throw e;
    }
  }

  /** Video ids of a playlist (up to 200), for the fallback playlist (R-31). */
  async playlistVideoIds(playlistId: string): Promise<string[]> {
    if (!this.apiUsable) return [];
    const ids: string[] = [];
    let pageToken: string | undefined;
    try {
      for (let page = 0; page < 4; page++) {
        const body = (await this.api('playlistItems', {
          part: 'contentDetails',
          playlistId,
          maxResults: '50',
          ...(pageToken ? { pageToken } : {}),
        })) as {
          items?: { contentDetails?: { videoId?: string } }[];
          nextPageToken?: string;
        };
        for (const i of body.items ?? []) {
          if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
        }
        pageToken = body.nextPageToken;
        if (!pageToken) break;
      }
    } catch (e) {
      this.logger.warn(
        `Fallback playlist ${playlistId} could not be read: ${String(e)}`,
      );
      return [];
    }
    return ids;
  }
}
