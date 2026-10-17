import { normalizeQuery } from '../contracts';

/** Words of a title / query: lowercase, NFC, split on anything that is not a letter or digit. */
export function matchWords(s: string): string[] {
  return s
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** `needle` appears in `hay` as consecutive whole words. */
function hasRun(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++)
      if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Score levels (higher is better); 0 = no match. */
export const SCORE = {
  accentedPhrase: 300,
  titlePhrase: 200,
  channelPhrase: 150,
  loose: 100,
} as const;

/**
 * How well a stored song matches what was typed (spec: tìm bài chính xác hơn).
 * Whole words only — "la" no longer matches "làm", "oi" no longer matches "người".
 * 300: the title holds the typed phrase with its accents; 200: the phrase without
 * accents in the title; 150: …in the channel name; 100: every word somewhere, or the
 * last word only as a prefix (a half-typed query).
 */
export function scoreTrack(
  title: string,
  channel: string | null,
  q: string,
): number {
  const typed = matchWords(q);
  const plainQ = matchWords(normalizeQuery(q));
  if (!plainQ.length) return 0;
  const plainTitle = matchWords(normalizeQuery(title));
  const plainChannel = matchWords(normalizeQuery(channel ?? ''));

  // Typed with accents (differs from its plain form): exact phrase with accents first.
  const hasAccents = typed.join(' ') !== plainQ.join(' ');
  if (hasAccents && hasRun(matchWords(title), typed))
    return SCORE.accentedPhrase;
  if (hasRun(plainTitle, plainQ)) return SCORE.titlePhrase;
  if (hasRun(plainChannel, plainQ)) return SCORE.channelPhrase;

  const words = new Set([...plainTitle, ...plainChannel]);
  const head = plainQ.slice(0, -1);
  const last = plainQ[plainQ.length - 1];
  if (!head.every((w) => words.has(w))) return 0;
  if (words.has(last)) return SCORE.loose;
  // Half-typed last word ("nguoi la o" → "ơi").
  for (const w of words) if (w.startsWith(last)) return SCORE.loose;
  return 0;
}

/** Sure enough to answer from the library without asking YouTube. */
export function isConfident(scores: number[], wordCount: number): boolean {
  const strong = scores.filter((s) => s >= SCORE.channelPhrase).length;
  return wordCount >= 2 ? strong >= 1 : strong >= 3;
}
