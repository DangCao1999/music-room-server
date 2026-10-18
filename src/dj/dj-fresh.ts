import { normalizeQuery } from '../contracts';
import type {
  FoundVideo,
  InnerTubeProvider,
} from '../music/innertube.provider';
import type { SearchService } from '../music/search.service';

/** Songs, not clips: one to ten minutes. */
const MIN_SEC = 60;
const MAX_SEC = 600;
const LOOK_AT = 20;
/** Titles that are not the song itself. */
const NOT_A_SONG =
  /\b(reaction|react|live|full album|album|tong hop|playlist|karaoke|cover|lyrics?|loi bai hat|beat|instrumental|remix|mashup|teaser|trailer|behind the scenes|bts|vlog|interview|shorts?)\b/;
const OFFICIAL = /\b(official|vevo|topic)\b/;
/** Marks of a release (not a fan upload or a clip). */
const RELEASE = /\b(official|mv|m\/v|music video|official audio|visualizer)\b/;

/**
 * "Bài mới / trending của <artist>" (spec 2026-10-18-dj-chat): the free AI has no live data,
 * so YouTube is asked for real. `verified` = InnerTube answered with the date / popularity
 * filters; false = a plain search fallback, which the DJ must not call "newest".
 */
export async function findFresh(
  deps: { innertube: InnerTubeProvider; search: SearchService },
  memberId: string,
  artist: string,
  mode: 'latest' | 'popular',
): Promise<{ videos: FoundVideo[]; verified: boolean }> {
  if (deps.innertube.available) {
    try {
      const tries =
        mode === 'latest'
          ? [
              { upload_date: 'month' as const },
              { upload_date: 'year' as const },
            ]
          : [
              {
                upload_date: 'year' as const,
                prioritize: 'popularity' as const,
              },
            ];
      for (const filters of tries) {
        const { videos } = await deps.innertube.search(
          `${artist} MV`,
          LOOK_AT,
          filters,
        );
        const songs = rank(videos, artist);
        if (songs.length) return { videos: songs, verified: true };
      }
      return { videos: [], verified: true };
    } catch {
      // InnerTube failing: the plain search below.
    }
  }
  const { results } = await deps.search.search(memberId, `${artist} mới nhất`);
  return {
    videos: rank(
      results.map((t) => ({
        externalId: t.externalId,
        title: t.title,
        channel: t.channel,
        durationSec: t.durationSec,
        thumbnailUrl: t.thumbnailUrl,
      })),
      artist,
    ),
    verified: false,
  };
}

/** Song-like videos of that artist, their own channel first, otherwise in YouTube's order. */
function rank(videos: FoundVideo[], artist: string): FoundVideo[] {
  const a = normalizeQuery(artist);
  const songs = videos.filter((v) => {
    const sec = v.durationSec ?? 0;
    if (sec < MIN_SEC || sec > MAX_SEC) return false;
    const title = normalizeQuery(v.title);
    if (NOT_A_SONG.test(title)) return false;
    const ch = normalizeQuery(v.channel ?? '');
    // The artist as a whole word of the title, from their channel, an official one, or a release.
    const named = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escape(a)}($|[^\\p{L}\\p{N}])`,
      'u',
    );
    if (!named.test(title) && !ch.includes(a)) return false;
    return ch.includes(a) || OFFICIAL.test(ch) || RELEASE.test(title);
  });
  const score = (v: FoundVideo) => {
    const ch = normalizeQuery(v.channel ?? '');
    // The artist's own channel, then any official one, then the rest.
    return ch.includes(a) ? 0 : OFFICIAL.test(ch) ? 1 : 2;
  };
  // Array.prototype.sort is stable: equal scores keep YouTube's order (date / popularity).
  return songs.sort((x, y) => score(x) - score(y));
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
