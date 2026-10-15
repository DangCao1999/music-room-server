// AI1, step 1: artist and song from a YouTube title, by rules only. Pure.
//
// Titles come in many shapes: "Artist - Song (Official MV)", "SONG | ARTIST | OFFICIAL MV",
// "Song - Artist", "Song" on an "Artist - Topic" channel. The side that looks like the
// channel name is the artist; when neither does, the order is unknown and the caller
// checks both with Last.fm.

import { normalizeQuery } from '../contracts';

export interface ParsedTitle {
  /** Best guess, or null when the title has no usable shape. */
  artist: string | null;
  song: string;
  /** The other order, when it is unclear which side is the artist. */
  swapped: { artist: string; song: string } | null;
  /** True when the shape alone settles it (Topic channel, or a side matches the channel). */
  confident: boolean;
}

// Words that mark a bracket or a trailing segment as packaging rather than the song name.
const NOISE =
  /\b(official|offical|mv|m\/v|music video|video|lyrics?|lyric video|audio|visuali[sz]er|4k|8k|hd|hq|1080p|720p|60fps|remaster(ed)?|vietsub|engsub|kara(oke)?|teaser|trailer|full|live|performance|ver(sion)?|prod\.?|beat|instrumental|cover|tiktok|playlist|nhạc|lời|bài hát)\b/i;
const BRACKETS = /\s*[([【「『{]([^)\]】」』}]*)[)\]】」』}]/g;
const HASHTAGS = /(^|\s)#[^\s#]+/g;
const FEAT = /\s+(?:ft\.?|feat\.?|featuring)\s+.*$/i;
// A lone lowercase "l" between spaces is a common stand-in for "|" in Vietnamese titles.
const SEPARATORS = /\s+[-–—|~l]\s+|\s*\|\s*|\s*｜\s*/;
/** "HURRYKNG, HIEUTHUHAI, MANBO" / "A x B" / "A & B" → "HURRYKNG": the main artist. */
const CO_ARTISTS = /\s*(?:,|\s[xX&]\s)\s*.*$/;
const CHANNEL_NOISE =
  /\s*(-\s*topic|vevo|official|channel|music|entertainment|records?)\s*$/i;

const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’\s.-]+|["'“”‘’\s.-]+$/g, '')
    .trim();

/** A segment that is only packaging ("OFFICIAL MV", "Lyrics 4K"), not part of the name. */
function isPackaging(segment: string): boolean {
  const rest = segment
    .replace(new RegExp(NOISE.source, 'gi'), '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return NOISE.test(segment) && rest.length < 3;
}

function stripNoise(title: string): string {
  return tidy(
    title
      .replace(BRACKETS, (whole, inner: string) =>
        NOISE.test(inner) ? ' ' : whole,
      )
      .replace(HASHTAGS, ' '),
  );
}

/** "Sơn Tùng M-TP Official" → "Sơn Tùng M-TP"; "AdeleVEVO" → "Adele". */
export function cleanChannel(channel: string | null): string | null {
  if (!channel) return null;
  let c = channel.replace(/VEVO$/, '').trim();
  for (let i = 0; i < 3; i++) c = c.replace(CHANNEL_NOISE, '').trim();
  return c || null;
}

/** Same artist name, ignoring accents, case, spaces and dots ("SƠN TÙNG M-TP" ≈ "Sơn Tùng MTP"). */
function sameName(a: string, b: string): boolean {
  const k = (s: string) => normalizeQuery(s).replace(/[^a-z0-9]/g, '');
  const x = k(a);
  const y = k(b);
  return (
    x.length >= 2 &&
    y.length >= 2 &&
    (x === y || x.includes(y) || y.includes(x))
  );
}

export function parseTitle(title: string, channel: string | null): ParsedTitle {
  const topic = channel && /\s-\s*Topic$/i.test(channel);
  const artistFromChannel = cleanChannel(channel);
  const segments = stripNoise(title)
    .split(SEPARATORS)
    .map(tidy)
    .filter((s) => s && !isPackaging(s));

  // "Artist - Topic" channels (YouTube Music auto uploads) carry the plain song title.
  if (topic && artistFromChannel) {
    return {
      artist: artistFromChannel,
      song: tidy(segments[0] ?? title),
      swapped: null,
      confident: true,
    };
  }

  if (segments.length >= 2) {
    // "PUPPY ft. DANGRANGTO" → "PUPPY": the main artist is what Last.fm knows.
    const parts = segments.map((x) => tidy(x.replace(FEAT, '')));
    const main = (x: string) => tidy(x.replace(CO_ARTISTS, '')) || x;
    // The segment that names the channel is the artist; the song sits next to it
    // ("MẶT MỘC | EM KHÔNG TRÁCH ANH ĐÂU - LYLY": artist LYLY, song the one before).
    const k = artistFromChannel
      ? parts.findIndex((x) => sameName(main(x), artistFromChannel))
      : -1;
    if (k >= 0) {
      const song = parts[k > 0 ? k - 1 : k + 1];
      return { artist: main(parts[k]), song, swapped: null, confident: true };
    }
    // Unknown order: "Artist - Song" is the more common one, keep the other for Last.fm.
    const [a, b] = parts;
    return {
      artist: main(a),
      song: b,
      swapped: { artist: main(b), song: a },
      confident: false,
    };
  }

  // One segment: the song name; the channel is the best guess for the artist.
  return {
    artist: artistFromChannel,
    song: tidy(segments[0] ?? title),
    swapped: null,
    confident: false,
  };
}
