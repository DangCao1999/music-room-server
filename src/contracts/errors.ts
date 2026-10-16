export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'ROOM_NOT_FOUND',
  'NAME_TAKEN',
  /** The name belongs to an offline admin: send adminPin to come back as them. */
  'PIN_REQUIRED',
  'PIN_INVALID',
  'PIN_LOCKED',
  /** The room has no admin PIN yet (rooms created before PINs returned). */
  'PIN_NOT_SET',
  'QUEUE_LIMIT',
  /** A6: the song is already waiting or on air. */
  'ALREADY_QUEUED',
  /** A6: the song started less than `gap` minutes ago (`minutes` = how long ago). */
  'PLAYED_RECENTLY',
  /** A5: reading a playlist needs YOUTUBE_API_KEY on the server. */
  'PLAYLIST_UNAVAILABLE',
  /** A5: no playable video (empty, private or all blocked from embedding). */
  'PLAYLIST_EMPTY',
  /** AI4: a wish that would be read aloud was refused. */
  'MESSAGE_BLOCKED',
  /** No free AI provider is configured or answering. */
  'AI_UNAVAILABLE',
  /** L1: the Google sign-in could not be verified. */
  'SIGN_IN_FAILED',
  /** L1: the server has no GOOGLE_CLIENT_ID. */
  'SIGN_IN_UNAVAILABLE',
  /** L2 */
  'PLAYLIST_NOT_FOUND',
  'PLAYLIST_LIMIT',
  'PLAYLIST_FULL',
  /** L3: Google refused the YouTube access token (expired, scope missing, API off…). */
  'YOUTUBE_ACCESS_DENIED',
  'TRACK_TOO_LONG',
  'TRACK_NOT_EMBEDDABLE',
  'TRACK_NOT_FOUND',
  'TRACK_LIVE',
  /** The room's admin blocked this video. */
  'TRACK_BLOCKED',
  'LINK_UNSUPPORTED',
  'SEARCH_UNAVAILABLE',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'STALE_ITEM',
  /** V1: this song was voted to stay; `seconds` until a new vote may start. */
  'SKIP_BLOCKED',
  /** V1: ❌ needs an open vote. */
  'VOTE_CLOSED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorParams = Record<string, string | number>;

export type AckError = { code: ErrorCode; params?: ErrorParams };

export type Ack<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; error: AckError };
