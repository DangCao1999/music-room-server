// Zod-free constants shared by server and client. The client imports these directly
// (never the barrel) so Zod stays out of the browser bundle.

/** Limits from the requirements doc (R-03 … R-47). */
export const LIMITS = {
  roomName: 50,
  displayName: 30,
  input: 2048,
  query: 100,
  djPrompt: 200,
  playlistName: 60,
  playlistDescription: 200,
  wish: 200,
  chat: 500,
  rawText: 4000,
} as const;

/** Song search: results per page ("Xem thêm" adds one) and at most this many in all. */
export const SEARCH_PAGE_SIZE = 12;
export const SEARCH_MAX_RESULTS = 36;

export const VOICE_PRESETS = [
  'radio',
  'drama',
  'baby',
  'panic',
  'chipmunk',
  'sleepy',
] as const;
export type VoicePreset = (typeof VOICE_PRESETS)[number];

/** The wish voice the sender picks (Edge TTS). `VOICE_PRESETS` stay only so older clients' commands still pass. */
export const VOICES = ['male', 'female'] as const;
export type Voice = (typeof VOICES)[number];

export const REACTIONS = [
  '❤️',
  '🔥',
  '👏',
  '😂',
  '🎉',
  '😍',
  '🤘',
  '💃',
] as const;
export type Reaction = (typeof REACTIONS)[number];

export const DJ_SOUNDS = [
  'build',
  'drop',
  'clap',
  'horn',
  'airhorn',
  'laugh',
  'applause',
] as const;
export type DjSound = (typeof DJ_SOUNDS)[number];

/** Room themes (room default, or each person's own choice in their browser). */
export const THEME_IDS = [
  'default',
  'listening',
  'hifi82',
  'midcentury',
  'walnut',
  'transistor',
  'cassette',
  'station',
  'astro',
  'cosmos',
  'saigon',
  'pixel',
  'synthwave',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Library (A1) and favourites (A2). */
export const LIBRARY_SORTS = ['recent', 'loved', 'most'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export const LIBRARY_LIMIT = 50;
export const LOOKUP_MAX_IDS = 50;
/** A5: songs added from a playlist in one go (each member's queue limit still applies). */
export const ADD_MANY_MAX = 20;

/**
 * V1 skip vote: when the time runs out, the song is skipped if ✅ outnumber ❌ and there
 * are at least this many ✅ — people who stay silent do not count against it.
 */
export const SKIP_MIN_YES = 2;

/** L2: per user / per playlist. */
export const MAX_PLAYLISTS = 50;
export const MAX_PLAYLIST_TRACKS = 200;
export const SHARE_CODE = /^[A-Za-z0-9]{10}$/;

/** Admin PIN: 4–8 digits. */
export const PIN_PATTERN = /^[0-9]{4,8}$/;

/** YouTube IFrame player error codes that mean "this video cannot be played". */
export const PLAYER_ERROR_CODES = [2, 5, 100, 101, 150] as const;
