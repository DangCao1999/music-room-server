// YouTube link parsing shared by client (to label the add button) and server
// (authoritative). Keep in sync with R-15 / spec §9.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const PATH_PREFIXES = ['shorts', 'embed', 'live', 'v', 'e'];

function toUrl(raw: string): URL | null {
  const value = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}

function baseHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
}

/** Returns the 11-char video id for any supported YouTube link (or a bare id), else null. */
export function parseYouTubeVideo(input: string): { videoId: string } | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  // A bare id must mix upper and lower case so short search words ("hello_world")
  // are not mistaken for ids; the rare all-lowercase id can still be added via a full link.
  if (VIDEO_ID.test(raw) && /[A-Z]/.test(raw) && /[a-z]/.test(raw)) {
    return { videoId: raw };
  }

  const url = toUrl(raw);
  if (!url) return null;
  const host = baseHost(url);

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? '';
    return VIDEO_ID.test(id) ? { videoId: id } : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;

  const v = url.searchParams.get('v');
  if (url.pathname === '/watch' && v && VIDEO_ID.test(v)) return { videoId: v };

  const [prefix, id] = url.pathname.split('/').filter(Boolean);
  if (prefix && PATH_PREFIXES.includes(prefix) && id && VIDEO_ID.test(id)) {
    return { videoId: id };
  }
  return null;
}

/** Returns the playlist id for youtube.com/playlist?list=… links (fallback playlist setting). */
export function parseYouTubePlaylist(
  input: string,
): { playlistId: string } | null {
  const url = toUrl(input.trim());
  if (!url) return null;
  const host = baseHost(url);
  if (host !== 'youtube.com') return null;
  const list = url.searchParams.get('list');
  if (url.pathname !== '/playlist' || !list || !PLAYLIST_ID.test(list)) {
    return null;
  }
  return { playlistId: list };
}

/** Rough classification for the "Thêm bài" input: link vs search query. */
export function looksLikeLink(input: string): boolean {
  const raw = input.trim();
  return (
    /^(https?:\/\/|www\.|m\.|music\.|youtu)/i.test(raw) || raw.includes('/')
  );
}
