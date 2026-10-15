import { z } from 'zod';
import {
  DJ_SOUNDS,
  ADD_MANY_MAX,
  LIBRARY_SORTS,
  LIMITS,
  LOOKUP_MAX_IDS,
  PIN_PATTERN,
  PLAYER_ERROR_CODES,
  REACTIONS,
  VOICE_PRESETS,
} from './constants';
import {
  cleanLine,
  cleanMultiline,
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
} from './text';
import { parseYouTubePlaylist, VIDEO_ID } from './youtube';

const line = (max: number, min = 1) =>
  z
    .string()
    .max(LIMITS.rawText)
    .transform(cleanLine)
    .pipe(z.string().min(min).max(max));

const multiline = (max: number, min = 1) =>
  z
    .string()
    .max(LIMITS.rawText)
    .transform(cleanMultiline)
    .pipe(z.string().min(min).max(max));

export const RoomNameSchema = line(LIMITS.roomName);
export const DisplayNameSchema = line(LIMITS.displayName);
export const RoomCodeSchema = z
  .string()
  .max(32)
  .transform(normalizeRoomCode)
  .pipe(z.string().regex(ROOM_CODE_PATTERN));
const Id = z.string().min(1).max(64);
export const PinSchema = z.string().regex(PIN_PATTERN);

export const RoomSettingsSchema = z.strictObject({
  skipThreshold: z.number().min(0.1).max(1),
  maxQueuedPerMember: z.number().int().min(1).max(20),
  maxTrackDurationSec: z
    .number()
    .int()
    .refine((v) => v === 0 || (v >= 60 && v <= 7200)),
  fallbackPlaylistUrl: z
    .string()
    .max(LIMITS.input)
    .nullable()
    .refine((v) => v === null || parseYouTubePlaylist(v) !== null),
  allowGuestDj: z.boolean(),
  /** A4: when the queue is empty, keep playing songs like the last one (known songs only). */
  autoRadio: z.boolean(),
  /** A6: a song cannot be added again within this many minutes of starting (0 = off). */
  repeatGapMinutes: z.number().int().min(0).max(1440),
  /** AI3: the speaker reads a short radio-style intro before members' songs. */
  mcIntro: z.boolean(),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  skipThreshold: 0.5,
  maxQueuedPerMember: 4,
  maxTrackDurationSec: 600,
  fallbackPlaylistUrl: null,
  allowGuestDj: false,
  autoRadio: false,
  repeatGapMinutes: 60,
  mcIntro: false,
};

/** Client → server command payloads. Every schema is strict: unknown keys are rejected (R-09, R-42). */
export const C2S = {
  'room:create': z.strictObject({
    name: RoomNameSchema,
    displayName: DisplayNameSchema,
    adminPin: PinSchema,
  }),
  'room:peek': z.strictObject({ code: RoomCodeSchema }),
  /**
   * A name held by an offline member brings that member back; an offline admin also
   * needs `adminPin` (PIN_REQUIRED otherwise).
   */
  'room:join': z.strictObject({
    code: RoomCodeSchema,
    /** Optional when signed in (the account's member or Google name is used). */
    displayName: DisplayNameSchema.optional(),
    adminPin: PinSchema.optional(),
  }),
  'room:leave': z.strictObject({}),
  /** Any member who knows the room's PIN becomes admin. */
  'admin:claim': z.strictObject({ pin: PinSchema }),
  /** Admin only: set or change the room's PIN. */
  'room:set-pin': z.strictObject({ pin: PinSchema }),
  /** Anyone with the room code may open the speaker page (no PIN). */
  'host:register': z.strictObject({ code: RoomCodeSchema }),
  'player:claim': z.strictObject({}),
  /** Keeps the lease alive while the room is idle (no item to report progress on). */
  'player:heartbeat': z.strictObject({}),
  'queue:add': z.strictObject({
    input: z.string().trim().min(1).max(LIMITS.input),
    wishMessage: multiline(LIMITS.wish, 0).optional(),
    voicePreset: z.enum(VOICE_PRESETS).optional(),
  }),
  'queue:remove': z.strictObject({ queueItemId: Id }),
  'queue:pin-next': z.strictObject({ queueItemId: Id }),
  'queue:heart': z.strictObject({ queueItemId: Id }),
  'queue:set-message': z.strictObject({
    queueItemId: Id,
    wishMessage: multiline(LIMITS.wish, 0),
    voicePreset: z.enum(VOICE_PRESETS).optional(),
  }),
  'queue:vote-skip': z.strictObject({ queueItemId: Id }),
  /** `remote: true` skips the server library and asks YouTube (costs search quota). */
  'search:query': z.strictObject({
    q: line(LIMITS.query),
    remote: z.boolean().optional(),
  }),
  'playback:control': z.strictObject({
    action: z.enum(['play', 'pause', 'skip', 'seek']),
    queueItemId: Id,
    positionSec: z.number().min(0).max(86_400).optional(),
  }),
  'player:report': z.strictObject({
    queueItemId: Id,
    event: z.enum(['started', 'progress', 'ended', 'error']),
    positionSec: z.number().min(0).max(86_400).optional(),
    errorCode: z
      .number()
      .int()
      .refine((c) => (PLAYER_ERROR_CODES as readonly number[]).includes(c))
      .optional(),
  }),
  'permission:set': z
    .strictObject({
      memberId: Id,
      canPlay: z.boolean().optional(),
      canControl: z.boolean().optional(),
      canDj: z.boolean().optional(),
      role: z.enum(['ADMIN', 'USER']).optional(),
    })
    .refine(
      (p) =>
        p.canPlay !== undefined ||
        p.canControl !== undefined ||
        p.canDj !== undefined ||
        p.role !== undefined,
    ),
  'member:kick': z.strictObject({ memberId: Id }),
  'room:settings': RoomSettingsSchema.partial().refine(
    (s) => Object.keys(s).length > 0,
  ),
  'chat:send': z.strictObject({ content: multiline(LIMITS.chat) }),
  'room:reaction': z.strictObject({ emoji: z.enum(REACTIONS) }),
  'dj:trigger': z.strictObject({ soundType: z.enum(DJ_SOUNDS) }),
  /** L1: sign in with a Google ID token (Google Identity Services). */
  'auth:google': z.strictObject({ credential: z.string().min(20).max(4096) }),
  /** L1: the account this socket is signed in with, if any. */
  'auth:me': z.strictObject({}),
  /** L6: rooms the signed-in user owns or has joined. */
  'me:rooms': z.strictObject({}),
  /** L1: songs saved on this device before signing in, added to the account. */
  'me:favorites-import': z.strictObject({
    videoIds: z.array(z.string().regex(VIDEO_ID)).max(300),
  }),
  /** AI2: songs for a request in plain words ("nhạc chill chiều thứ 6"). */
  'dj:ask': z.strictObject({ prompt: line(LIMITS.djPrompt) }),
  /** A8: what the room played since `since` (at most 31 days back). */
  'room:recap': z.strictObject({
    since: z.iso.datetime(),
    tzOffsetMinutes: z.number().int().min(-840).max(840),
  }),
  /** A5: the playable songs of a YouTube playlist link. */
  'playlist:open': z.strictObject({
    url: z
      .string()
      .max(LIMITS.input)
      .refine((v) => parseYouTubePlaylist(v) !== null),
  }),
  /** A5: add several known songs in order, until the member's queue limit. */
  'queue:add-many': z.strictObject({
    trackIds: z
      .array(z.string().regex(/^youtube:[A-Za-z0-9_-]{11}$/))
      .min(1)
      .max(ADD_MANY_MAX),
  }),
  /** A7: lyrics for a song (LRCLIB), synced to the music when available. */
  'lyrics:get': z.strictObject({
    trackId: z.string().regex(/^youtube:[A-Za-z0-9_-]{11}$/),
  }),
  /** A3: songs to play next, for the song on air unless `trackId` is given. */
  'suggest:next': z.strictObject({
    trackId: z
      .string()
      .regex(/^youtube:[A-Za-z0-9_-]{11}$/)
      .optional(),
  }),
  /** A1: songs this room has played, grouped by track. */
  'library:room': z.strictObject({ sort: z.enum(LIBRARY_SORTS) }),
  /** A2: save / unsave a song ("Lưu"). Idempotent. */
  'favorite:set': z.strictObject({
    trackId: z.string().regex(/^youtube:[A-Za-z0-9_-]{11}$/),
    saved: z.boolean(),
  }),
  'favorite:list': z.strictObject({}),
  /** Name and artwork for video ids saved on this device in other rooms. */
  'tracks:lookup': z.strictObject({
    videoIds: z.array(z.string().regex(VIDEO_ID)).min(1).max(LOOKUP_MAX_IDS),
  }),
} as const;

export type CommandName = keyof typeof C2S;
export type CommandPayload<K extends CommandName> = z.input<(typeof C2S)[K]>;
export type CommandInput<K extends CommandName> = z.output<(typeof C2S)[K]>;

/** Commands a socket may send before it is bound to a member. */
export const ANONYMOUS_COMMANDS: readonly CommandName[] = [
  'room:create',
  'room:peek',
  'room:join',
  'host:register',
  'auth:google',
  'auth:me',
  'me:rooms',
  'me:favorites-import',
];
