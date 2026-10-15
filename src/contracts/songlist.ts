// L4: "Dán danh sách bài" — a pasted list of songs, one per line. Zod-free so the
// client can split and preview the list exactly as the server will read it.

import { cleanLine, normalizeQuery } from './text';

export const SONGLIST_MAX_LINES = 50;
export const SONGLIST_LINE_MAX = 150;

/** "1. ", "01) ", "#3 ", "- ", "• " at the start of a line. */
const LEADING_MARK = /^(?:#?\d{1,3}\s*[.):\]]|#\d{1,3}|[-*•·–—+>])\s*/;
/** "3:45", "(3:45)", "[1:02:03]" at the end of a line. */
const TRAILING_DURATION = /\s*[([]?\d{1,2}:\d{2}(?::\d{2})?[)\]]?\s*$/;

/** One pasted line without numbering, bullets and durations; '' when nothing is left. */
export function cleanSongLine(raw: string): string {
  const v = cleanLine(raw)
    .replace(LEADING_MARK, '')
    .replace(TRAILING_DURATION, '')
    .trim();
  return /[\p{L}\p{N}]/u.test(v) ? v.slice(0, SONGLIST_LINE_MAX) : '';
}

/** Cleaned, de-duplicated lines in their original order (the first SONGLIST_MAX_LINES). */
export function splitSongList(text: string): {
  lines: string[];
  dropped: number;
} {
  const seen = new Set<string>();
  const all: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const v = cleanSongLine(raw);
    const key = normalizeQuery(v);
    if (!v || seen.has(key)) continue;
    seen.add(key);
    all.push(v);
  }
  return {
    lines: all.slice(0, SONGLIST_MAX_LINES),
    dropped: Math.max(0, all.length - SONGLIST_MAX_LINES),
  };
}

/** Search words for a line: separators such as " - " or " | " become spaces. */
export function songLineQuery(line: string): string {
  return line
    .replace(/\s+[-–—|•·~/]+\s+/g, ' ')
    .replace(/["“”«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
