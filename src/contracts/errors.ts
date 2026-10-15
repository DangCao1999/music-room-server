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
  'TRACK_TOO_LONG',
  'TRACK_NOT_EMBEDDABLE',
  'TRACK_NOT_FOUND',
  'TRACK_LIVE',
  'LINK_UNSUPPORTED',
  'SEARCH_UNAVAILABLE',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'STALE_ITEM',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorParams = Record<string, string | number>;

export type AckError = { code: ErrorCode; params?: ErrorParams };

export type Ack<T = Record<string, never>> =
  | { ok: true; data: T }
  | { ok: false; error: AckError };
