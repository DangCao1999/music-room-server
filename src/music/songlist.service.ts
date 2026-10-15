import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import {
  cleanSongLine,
  type CommandResults,
  normalizeQuery,
  parseYouTubeVideo,
  type SongListItemView,
  type SongListStop,
  songLineQuery,
  type TrackSummary,
} from '../contracts';
import { LibraryService } from '../library/library.service';
import { SearchService } from './search.service';

type Result = CommandResults['songlist:match'];

/** YouTube searches running at once for one list. */
const CONCURRENCY = 4;
/** Stop starting new YouTube searches after this, so the ack (15 s) is never missed. */
const BUDGET_MS = 9000;
/** A library match on a single word ("hello") is too likely wrong: ask YouTube instead. */
const LIBRARY_MIN_WORDS = 2;
/** Prefer a song over hour-long compilations when YouTube offers both. */
const SONG_MAX_SEC = 15 * 60;

/** A link or URI we cannot read songs from (Spotify, Apple Music, Zing…). */
const OTHER_LINK =
  /(?:https?:\/\/|www\.|spotify:)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|vn|be|fm|co|me|ly|app|link)\/\S*/i;

/** Other versions of a song: only wanted when the pasted line asks for them. */
const VARIANTS = [
  'remix',
  'cover',
  'karaoke',
  'beat',
  'instrumental',
  'lofi',
  'live',
  'sped',
  'slowed',
  '8d',
  'nightcore',
  'mashup',
  'acoustic',
  'reaction',
];

const wordsOf = (text: string): string[] =>
  normalizeQuery(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * The best song for `words`, keeping the source's order otherwise: no remix / cover /
 * live… unless asked for, not hour-long, and (for the library, which has no ranking of
 * its own) as few extra words in the title as possible.
 */
function pick(
  tracks: TrackSummary[],
  words: string[],
  byTitleLength: boolean,
): TrackSummary | null {
  const asked = new Set(words);
  const score = (t: TrackSummary) => {
    const title = wordsOf(t.title);
    const variants = VARIANTS.filter(
      (v) => title.includes(v) && !asked.has(v),
    ).length;
    const long = t.durationSec !== null && t.durationSec > SONG_MAX_SEC;
    const extra = byTitleLength ? title.filter((w) => !asked.has(w)).length : 0;
    return variants * 1000 + (long ? 500 : 0) + extra;
  };
  return (
    tracks
      .map((t, i) => ({ t, i, s: score(t) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)[0]?.t ?? null
  );
}

/**
 * L4: a song for each pasted line, cheapest first — YouTube video links (videos.list),
 * an earlier search for the same words, songs the server already knows, and only then a
 * YouTube search, which shares the member's hourly search limit with the search box.
 */
@Injectable()
export class SongListService {
  private readonly logger = new Logger(SongListService.name);

  constructor(
    private readonly search: SearchService,
    private readonly library: LibraryService,
  ) {}

  async match(memberId: string, lines: string[]): Promise<Result> {
    const items: SongListItemView[] = lines.map((line) => ({
      line,
      status: 'later',
      track: null,
    }));
    const set = (i: number, track: TrackSummary | null) =>
      (items[i] = {
        ...items[i],
        status: track ? 'found' : 'notFound',
        track,
      });

    // 1. Links: YouTube videos are looked up together; anything else cannot be read.
    const videoIds = new Map<number, string>();
    items.forEach((it, i) => {
      const video = parseYouTubeVideo(it.line);
      if (video) videoIds.set(i, video.videoId);
      else if (OTHER_LINK.test(it.line)) it.status = 'unsupported';
    });
    if (videoIds.size) {
      const { tracks } = await this.library.lookup([...videoIds.values()]);
      const byId = new Map(tracks.map((t) => [t.id, t]));
      for (const [i, v] of videoIds) set(i, byId.get(`youtube:${v}`) ?? null);
    }

    // 2. Free: an earlier search for the same words, then songs the server knows.
    // The client already cleans lines; doing it again keeps other callers honest.
    const queries = items.map((it) =>
      songLineQuery(cleanSongLine(it.line) || it.line),
    );
    const toSearch: number[] = [];
    for (const [i, it] of items.entries()) {
      if (it.status !== 'later') continue;
      const words = wordsOf(queries[i]);
      const cached = await this.search.cached(queries[i]);
      if (cached) {
        set(i, pick(cached, words, false));
        continue;
      }
      const known =
        words.length >= LIBRARY_MIN_WORDS
          ? pick(await this.search.fromLibrary(words.join(' ')), words, true)
          : null;
      if (known) set(i, known);
      else toSearch.push(i);
    }

    // 3. YouTube, a few at a time, until the member's hourly limit or the time budget.
    let stopped: SongListStop | null = null;
    const deadline = Date.now() + BUDGET_MS;
    let next = 0;
    const worker = async () => {
      while (next < toSearch.length && !stopped) {
        if (Date.now() > deadline) {
          stopped = { reason: 'TIME' };
          return;
        }
        const i = toSearch[next++];
        try {
          const { results } = await this.search.search(
            memberId,
            queries[i],
            true,
          );
          set(i, pick(results, wordsOf(queries[i]), false));
        } catch (e) {
          if (
            e instanceof AppError &&
            (e.code === 'RATE_LIMITED' ||
              e.code === 'QUOTA_EXCEEDED' ||
              e.code === 'SEARCH_UNAVAILABLE')
          ) {
            const seconds = Number(e.params?.seconds);
            stopped = {
              reason: e.code,
              ...(Number.isFinite(seconds) ? { seconds } : {}),
            };
            return;
          }
          // One failed search must not lose the rest of the list.
          this.logger.warn(`songlist search failed: ${String(e)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return {
      items,
      stopped: items.some((it) => it.status === 'later') ? stopped : null,
    };
  }
}
