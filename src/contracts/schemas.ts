import { z } from 'zod';
import {
  DJ_SOUNDS,
  LIMITS,
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
import { parseYouTubePlaylist } from './youtube';

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
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  skipThreshold: 0.5,
  maxQueuedPerMember: 4,
  maxTrackDurationSec: 600,
  fallbackPlaylistUrl: null,
  allowGuestDj: false,
};

/** Client → server command payloads. Every schema is strict: unknown keys are rejected (R-09, R-42). */
export const C2S = {
  'room:create': z.strictObject({
    name: RoomNameSchema,
    displayName: DisplayNameSchema,
  }),
  'room:peek': z.strictObject({ code: RoomCodeSchema }),
  'room:join': z.strictObject({
    code: RoomCodeSchema,
    displayName: DisplayNameSchema,
  }),
  'room:leave': z.strictObject({}),
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
];
