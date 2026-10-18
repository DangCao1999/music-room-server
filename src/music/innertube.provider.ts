import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { HTTP_TIMEOUT_MS } from './youtube.provider';

/** youtubei.js search filters the DJ uses for "newest / trending" (spec 2026-10-18-dj-chat). */
export interface SearchFilters {
  upload_date?: 'week' | 'month' | 'year';
  prioritize?: 'popularity';
}

/** A video found by YouTube's own web search (not yet checked through the Data API). */
export interface FoundVideo {
  externalId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
}

/** Failures in a row before InnerTube is left alone for a while. */
export const INNERTUBE_MAX_FAILURES = 3;
export const INNERTUBE_COOLDOWN_MS = 30 * 60_000;
/** Result pages YouTube is asked for at most in one search (about 20 videos each). */
const MAX_PAGES = 4;
/** Shorts and clips this short are not songs. */
const MIN_DURATION_SEC = 60;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Nodes YouTube shows when a search has no results ("Không tìm thấy kết quả"…). */
const EMPTY_NOTICES = new Set([
  'BackgroundPromo',
  'Message',
  'ShowingResultsFor',
  'DidYouMean',
]);

type YouTubeJs = typeof import('youtubei.js');
type VideoNode = InstanceType<YouTubeJs['YTNodes']['Video']>;
type Innertube = Awaited<
  ReturnType<(typeof import('youtubei.js'))['Innertube']['create']>
>;

/**
 * Song search through InnerTube, the private API youtube.com itself uses (via the
 * youtubei.js library): no API key and no quota. Unofficial, so it may break or get
 * blocked; callers fall back to the Data API search, and repeated failures switch it
 * off for INNERTUBE_COOLDOWN_MS. `YOUTUBE_SEARCH_PROVIDER=api` turns it off entirely.
 */
@Injectable()
export class InnerTubeProvider {
  private readonly logger = new Logger(InnerTubeProvider.name);
  private client: Promise<Innertube> | null = null;
  private failures = 0;
  private offUntil = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return this.env.YOUTUBE_SEARCH_PROVIDER === 'innertube';
  }

  /** Enabled and not resting after repeated failures. */
  get available(): boolean {
    return this.enabled && Date.now() >= this.offUntil;
  }

  /**
   * Up to `max` songs (no Shorts, live streams or premieres), in YouTube's order, walking
   * its result pages as needed. `more`: YouTube had songs beyond these. Throws on failure.
   */
  async search(
    q: string,
    max: number,
    filters?: SearchFilters,
  ): Promise<{ videos: FoundVideo[]; more: boolean }> {
    try {
      const found = await this.find(q, max, filters);
      this.failures = 0;
      return found;
    } catch (e) {
      this.client = null; // a fresh session next time
      if (++this.failures >= INNERTUBE_MAX_FAILURES) {
        this.failures = 0;
        this.offUntil = Date.now() + INNERTUBE_COOLDOWN_MS;
        this.logger.warn(
          `InnerTube search failing, off for ${INNERTUBE_COOLDOWN_MS / 60_000} min: ${String(e)}`,
        );
      }
      throw e;
    }
  }

  private async find(
    q: string,
    max: number,
    filters?: SearchFilters,
  ): Promise<{ videos: FoundVideo[]; more: boolean }> {
    const yt = await this.session();
    let res = await withTimeout(
      yt.search(q, { type: 'video', ...filters }),
      HTTP_TIMEOUT_MS,
    );
    // A page we cannot read (layout changed) is a failure, not "no results".
    if (!Array.isArray(res.results))
      throw new Error('InnerTube: unexpected search response');
    // Only YouTube's own "no results" notices: truly nothing found.
    if (
      !res.videos.length &&
      res.results.every((n) => EMPTY_NOTICES.has(n.type))
    )
      return { videos: [], more: false };
    // Items we do not know at all (a new page layout): a failure, not "nothing".
    if (!res.videos.some((n) => n.type === 'Video'))
      throw new Error('InnerTube: unexpected search results');

    const out: FoundVideo[] = [];
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
      for (const node of res.videos) {
        if (node.type !== 'Video') continue;
        const v = node as VideoNode;
        if (v.is_live || v.is_upcoming || seen.has(v.video_id)) continue;
        const seconds = v.duration.seconds;
        if (seconds > 0 && seconds < MIN_DURATION_SEC) continue;
        seen.add(v.video_id);
        out.push({
          externalId: v.video_id,
          title: v.title.toString() || v.video_id,
          channel:
            v.author.name && v.author.name !== 'N/A' ? v.author.name : null,
          durationSec: seconds > 0 ? seconds : null,
          thumbnailUrl: `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
        });
        if (out.length >= max) return { videos: out, more: true };
      }
      // Videos found but all Shorts / live: nothing usable is still a real answer.
      if (!res.has_continuation) return { videos: out, more: false };
      if (page >= MAX_PAGES) return { videos: out, more: true };
      res = await withTimeout(res.getContinuation(), HTTP_TIMEOUT_MS);
    }
  }

  /**
   * What YouTube itself would play after this video: YouTube Music's radio ("Phát tiếp",
   * up to ~50 songs by the same and related artists), else youtube.com's "Up next" feed.
   * Video ids in YouTube's order, without the video itself; [] when neither answers.
   */
  async upNext(videoId: string): Promise<string[]> {
    if (!this.available) return [];
    const yt = await this.session();
    const own = (ids: (string | undefined)[]) => [
      ...new Set(
        ids.filter(
          (id): id is string =>
            typeof id === 'string' && VIDEO_ID.test(id) && id !== videoId,
        ),
      ),
    ];
    try {
      const radio = await withTimeout(
        yt.music.getUpNext(videoId, true),
        HTTP_TIMEOUT_MS,
      );
      const ids = own(
        (radio.contents ?? []).map(
          (x) => (x as { video_id?: string }).video_id,
        ),
      );
      if (ids.length) return ids;
    } catch (e) {
      this.logger.warn(
        `YouTube Music up next for ${videoId} failed: ${String(e)}`,
      );
    }
    try {
      const info = await withTimeout(yt.getInfo(videoId), HTTP_TIMEOUT_MS);
      return own(
        (info.watch_next_feed ?? []).map((x) => {
          const n = x as {
            video_id?: string;
            id?: string;
            content_id?: string;
          };
          return n.video_id ?? n.content_id ?? n.id;
        }),
      );
    } catch (e) {
      this.logger.warn(`YouTube up next for ${videoId} failed: ${String(e)}`);
      return [];
    }
  }

  private session(): Promise<Innertube> {
    // youtubei.js is ESM-only: loaded on first use with a real dynamic import.
    this.client ??= import('youtubei.js').then(({ Innertube }) =>
      Innertube.create({ lang: 'vi', location: 'VN', retrieve_player: false }),
    );
    return this.client;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`InnerTube: timed out after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
