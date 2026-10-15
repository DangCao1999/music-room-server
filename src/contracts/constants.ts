// Zod-free constants shared by server and client. The client imports these directly
// (never the barrel) so Zod stays out of the browser bundle.

/** Limits from the requirements doc (R-03 … R-47). */
export const LIMITS = {
  roomName: 50,
  displayName: 30,
  input: 2048,
  query: 100,
  wish: 200,
  chat: 500,
  rawText: 4000,
} as const;

export const VOICE_PRESETS = [
  'radio',
  'drama',
  'baby',
  'panic',
  'chipmunk',
  'sleepy',
] as const;
export type VoicePreset = (typeof VOICE_PRESETS)[number];

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

/** Admin PIN: 4–8 digits. */
export const PIN_PATTERN = /^[0-9]{4,8}$/;

/** YouTube IFrame player error codes that mean "this video cannot be played". */
export const PLAYER_ERROR_CODES = [2, 5, 100, 101, 150] as const;
