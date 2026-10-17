import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { HTTP_TIMEOUT_MS } from './youtube.provider';

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
const MAX_RESULTS = 10;
/** Shorts and clips this short are not songs. */
const MIN_DURATION_SEC = 60;

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

  /** Up to 10 songs (no Shorts, live streams or premieres), in YouTube's order. Throws on failure. */
  async search(q: string): Promise<FoundVideo[]> {
    try {
      const found = await withTimeout(this.find(q), HTTP_TIMEOUT_MS);
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

  private async find(q: string): Promise<FoundVideo[]> {
    const yt = await this.session();
    const res = await yt.search(q, { type: 'video' });
    // A page we cannot read (layout changed) is a failure, not "no results".
    if (!Array.isArray(res.results))
      throw new Error('InnerTube: unexpected search response');
    const out: FoundVideo[] = [];
    for (const node of res.videos) {
      if (node.type !== 'Video') continue;
      const v = node as VideoNode;
      if (v.is_live || v.is_upcoming) continue;
      const seconds = v.duration.seconds;
      if (seconds > 0 && seconds < MIN_DURATION_SEC) continue;
      out.push({
        externalId: v.video_id,
        title: v.title.toString() || v.video_id,
        channel:
          v.author.name && v.author.name !== 'N/A' ? v.author.name : null,
        durationSec: seconds > 0 ? seconds : null,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
      });
      if (out.length >= MAX_RESULTS) break;
    }
    // Results we could not use at all (a new layout, all Shorts…): a failure, not "nothing".
    if (res.results.length > 0 && out.length === 0)
      throw new Error('InnerTube: no usable videos in the results');
    return out;
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
