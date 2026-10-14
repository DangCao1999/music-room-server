// Text normalization shared by client and server so both sides agree on what
// counts as "the same name" and what a valid room code looks like.

/** Invisible / bidi-control characters that can be abused to fake names. ZWJ (U+200D) is kept for emoji. */
const INVISIBLE = /[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = /[\u0000-\u001F\u007F-\u009F]/g;

/** Single-line text: NFC, no control or invisible chars, collapsed whitespace, trimmed. */
export function cleanLine(input: string): string {
  return input
    .normalize('NFC')
    .replace(CONTROL_ALL, '')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Multi-line text (chat, wishes): keeps newlines, strips other control/invisible chars. */
export function cleanMultiline(input: string): string {
  return input
    .normalize('NFC')
    .replace(CONTROL_EXCEPT_NEWLINE, '')
    .replace(INVISIBLE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Case-insensitive identity key for display names (keeps diacritics: "Duc" != "Đức"). */
export function nameKey(displayName: string): string {
  return cleanLine(displayName).toLocaleLowerCase('vi');
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/** Accepts " k7m2qx " and returns "K7M2QX". */
export function normalizeRoomCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Search cache key: lowercase, no diacritics (đ → d), collapsed whitespace. */
export function normalizeQuery(input: string): string {
  return cleanLine(input)
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}
