// AI4, step 1: a small word list, accents and case ignored. Pure.
//
// Catches the obvious cases without any network call. Wishes are read aloud by the
// speaker, so they also get an AI check (ModerationService); chat only gets this list.

import { normalizeQuery } from '../contracts';

// Normalised (lowercase, no accents, đ → d). Whole words only.
const BLOCKED = [
  'dit',
  'djt',
  'du ma',
  'dm',
  'dmm',
  'dcm',
  'dkm',
  'vcl',
  'vkl',
  'vl',
  'clm',
  'cmm',
  'lon',
  'cac',
  'buoi',
  'deo',
  'dech',
  'dien',
  'ngu nhu bo',
  'oc cho',
  'thang cho',
  'con cho',
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'pussy',
  'motherfucker',
  'asshole',
];
// Too common as normal words without accents: only blocked when written with them.
const ONLY_WITH_ACCENTS = new Map([
  ['lon', /lồn/i],
  ['cac', /cặc/i],
  ['buoi', /buồi/i],
  ['deo', /đéo/i],
  ['dien', /điên/i],
  ['dit', /địt/i],
]);

const words = (text: string) =>
  ` ${normalizeQuery(text).replace(/[^a-z0-9]+/g, ' ')} `;

/** The blocked words found in `text` (normalised), or [] when it is clean. */
export function blockedWords(text: string): string[] {
  const w = words(text);
  return BLOCKED.filter((b) => {
    if (!w.includes(` ${b} `)) return false;
    const accented = ONLY_WITH_ACCENTS.get(b);
    return accented ? accented.test(text) : true;
  });
}

/** Chat: blocked words replaced by "***", the rest untouched. */
export function maskBlocked(text: string): string {
  const found = blockedWords(text);
  if (!found.length) return text;
  let out = text;
  for (const token of text.split(/(\s+)/)) {
    if (!token.trim()) continue;
    if (blockedWords(token).length) out = out.replace(token, '***');
  }
  return out;
}
