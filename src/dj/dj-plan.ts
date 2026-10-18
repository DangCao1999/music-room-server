import { LIMITS } from '../contracts';
import {
  FILLER_START,
  freshMatch,
  plain,
  tail,
  vagueIn,
  words,
} from './dj-rules';

/**
 * "@DJ" requests that hold several tasks (spec 2026-10-18-dj-chat, combos): the DJ does them
 * itself, in order, as the asker. A single task the asker can do stays a guide (dj-rules).
 * Matching runs on the accent-free text; names and titles are cut from the original words.
 */

export type Pin = 'next' | 'now';

/** Which queue songs: all, the asker's, someone's, by title, or the asker's last few. */
export interface Target {
  all?: boolean;
  mine?: boolean;
  by?: string;
  titles?: string[];
  last?: number;
}

export type PlanStep =
  | { do: 'add'; titles: string[]; pin?: Pin }
  | {
      do: 'addArtist';
      artist: string;
      count: number;
      mode: 'top' | 'latest' | 'popular';
      pin?: Pin;
    }
  | { do: 'addVague'; text: string; count: number; pin?: Pin }
  | { do: 'addFrom'; source: 'played' | 'saved'; count: number; pin?: Pin }
  | { do: 'heart'; target: Target }
  | { do: 'remove'; target: Target }
  | { do: 'replace'; from: string; to: string }
  | { do: 'skip' }
  | { do: 'pause' }
  | { do: 'resume' };

export interface Plan {
  steps: PlanStep[];
  /** Sent with the first song added. */
  wish?: string;
}

/** Songs one "add" may bring at most ("vài bài" = 3). */
export const MAX_SONGS = 5;
const SOME = 3;

type Verb =
  | 'add'
  | 'addAgain'
  | 'heart'
  | 'remove'
  | 'replace'
  | 'skip'
  | 'pause'
  | 'resume';

/** Most specific first: "phát tiếp" is resume, not "phát" (add). */
const VERBS: [Verb, RegExp][] = [
  ['resume', /^(phat tiep|tiep tuc phat|tiep tuc|resume)( |$)/],
  ['pause', /^(tam dung|dung nhac|dung lai|tat nhac|pause)( |$)/],
  ['skip', /^(skip|bo qua|qua bai|chuyen bai|next)( |$)/],
  ['heart', /^(tha tim|like|heart)( cho)?( |$)/],
  ['remove', /^(go bo|go|xoa|rut|remove|delete)( |$)/],
  ['replace', /^(doi|thay)( |$)/],
  ['addAgain', /^(bat lai|phat lai|mo lai|nghe lai|them lai)( |$)/],
  ['add', /^(bat|them|mo|phat|cho nghe|nghe|play|add|queue|xep)( |$)/],
];

/** Polite words right after the verb: "thêm giúp tôi", "bật cho mình". */
const AFTER_VERB = /^((giup|dum|cho) (toi|minh|em|tui|anh|chi) |giup |dum )/;

const SEP =
  /\s*[,;]\s*|\s+(?:và|rồi|sau đó|xong rồi|xong|với cả|với lại|and|then)\s+/iu;

const NUMBERS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
  sau: 6,
};
const COUNT =
  /^(\d{1,2}|mot|hai|ba|bon|nam|sau|vai|mot vai|may|mot so|cac|nhung) (bai hat|bai|ban|ca khuc|track|songs?)( |$)/;
const ONE = /^(bai hat|bai|ca khuc|song) /;

const PIN_NOW =
  /( |^)(ngay bay gio|ngay luc nay|ngay lap tuc|luon bay gio|phat ngay|bat ngay|luon)$/;
const PIN_NEXT =
  /( |^)(ngay sau bai nay|sau bai nay|tiep theo|ke tiep|len dau hang cho|len dau|dau tien)$/;

const PLAYED = /^(vua phat|luc nay|vua roi|da phat|hoi nay|truoc do)( |$)/;
const SAVED =
  /^((nhung|cac) )?(bai )?((toi|minh|em|tui) )?(da )?(luu|yeu thich|thich)( |$)/;
const BY = /^(nhac |bai |bai hat |ca khuc )?(cua|of|by) /;
const ME = /^(toi|minh|em|tui|me)$/;
const ALL =
  /^(het|tat ca|toan bo|ca hang cho|het hang cho|moi bai|tat ca cac bai|het cac bai)( |$)/;
const OWNER = /^((het|tat ca|cac|nhung|may) )?(bai )?(cua) /;
const LAST = /^(\d{1,2}|mot|hai|ba|bon|nam) bai (cuoi|sau cung|moi them)/;
const INTO = / (thanh|bang|sang|qua) /;

/** "kèm lời chúc …", "với lời nhắn: …"; "tặng Lan" becomes the wish "Tặng Lan". */
const WISH =
  /[\s,]*(?:kèm|với|cùng|có)?\s*(?:theo\s+)?(?:lời chúc|lời nhắn|lời tặng|câu chúc)\s*(?:là|rằng)?\s*[:\-–]?\s*(.+)$/iu;
const GIFT = /[\s,]*(?:để\s+)?(?:dành tặng|gửi tặng|tặng)\s+(?:cho\s+)?(.+)$/iu;

function unquote(s: string): string {
  return s
    .trim()
    .replace(/^["“”'‘’«]+|["“”'‘’»]+$/g, '')
    .trim();
}

export function extractWish(text: string): { rest: string; wish?: string } {
  for (const [re, make] of [
    [WISH, (w: string) => w],
    [GIFT, (w: string) => `Tặng ${w}`],
  ] as const) {
    const m = re.exec(text);
    const w = m ? unquote(m[1]) : '';
    if (m && w)
      return {
        rest: text.slice(0, m.index).trim(),
        wish: make(w).slice(0, LIMITS.wish),
      };
  }
  return { rest: text };
}

/** Words of `p` (plain) matched at the start by `re`, or 0. */
function lead(p: string, re: RegExp): number {
  const m = re.exec(p);
  return m ? m[0].trim().split(' ').filter(Boolean).length : 0;
}

/** `p` and the original text without their first `n` words. */
function drop(
  p: string,
  original: string,
  n: number,
): { p: string; original: string } {
  if (!n) return { p, original };
  return {
    p: p.split(' ').slice(n).join(' '),
    original: words(original).slice(n).join(' '),
  };
}

function verbOf(seg: string): { verb: Verb; rest: string } | null {
  let p = plain(seg);
  let o = seg;
  ({ p, original: o } = drop(p, o, lead(p, FILLER_START)));
  for (const [verb, re] of VERBS) {
    const n = lead(p, re);
    if (!n) continue;
    ({ p, original: o } = drop(p, o, n));
    ({ p, original: o } = drop(p, o, lead(p, AFTER_VERB)));
    return { verb, rest: o };
  }
  return null;
}

/** "3 bài", "vài bài", "bài" → how many, and the words after it. */
function countOf(o: string): { count: number; rest: string; said: boolean } {
  const p = plain(o);
  const m = COUNT.exec(p);
  if (m) {
    const w = m[1];
    const n = /^\d+$/.test(w) ? Number(w) : (NUMBERS[w] ?? SOME);
    return {
      count: Math.max(1, Math.min(MAX_SONGS, n)),
      rest: drop(p, o, lead(p, COUNT)).original,
      said: true,
    };
  }
  return { count: 1, rest: drop(p, o, lead(p, ONE)).original, said: false };
}

/** "… ngay sau bài này" / "… luôn": pin the song next, or play it now. */
function pinOf(o: string): { pin?: Pin; rest: string } {
  const p = plain(o);
  for (const [re, pin] of [
    [PIN_NEXT, 'next'],
    [PIN_NOW, 'now'],
  ] as const) {
    const m = re.exec(p);
    if (!m) continue;
    const n = m[0].trim().split(' ').length;
    const ws = words(o);
    return { pin, rest: ws.slice(0, ws.length - n).join(' ') };
  }
  return { rest: o };
}

function addObject(obj: string, again: boolean): PlanStep | null {
  const { pin, rest: noPin } = pinOf(obj);
  const { count, rest, said } = countOf(noPin);
  const p = plain(rest);
  const many = said ? count : again ? SOME : 1;
  if (again || PLAYED.test(p))
    return { do: 'addFrom', source: 'played', count: many, pin };
  if (SAVED.test(p))
    return { do: 'addFrom', source: 'saved', count: many, pin };
  const fresh = freshMatch(rest, p, 0);
  if (fresh)
    return {
      do: 'addArtist',
      artist: fresh.artist,
      count,
      mode: fresh.mode,
      pin,
    };
  const by = lead(p, BY);
  if (by) {
    const artist = tail(rest, by);
    if (!artist || vagueIn(artist)) return null;
    return { do: 'addArtist', artist, count, mode: 'top', pin };
  }
  if (!p) return null;
  if (vagueIn(rest) || said) return { do: 'addVague', text: rest, count, pin };
  const title = tail(rest, 0);
  return title ? { do: 'add', titles: [title], pin } : null;
}

/** Queue songs named in a heart / remove: all, the asker's, someone's, the last few, titles. */
function targetOf(objs: string[]): Target | null {
  const t: Target = {};
  for (const obj of objs) {
    const p = plain(obj);
    if (!p || /^(bai nay|no)$/.test(p)) continue;
    // "hết bài của Lan": someone's songs, checked before "hết" (all).
    const owner = lead(p, OWNER);
    if (owner) {
      const name = tail(obj, owner);
      if (ME.test(plain(name))) t.mine = true;
      else if (name) t.by = name;
      continue;
    }
    if (ALL.test(p)) {
      const n = lead(p, ALL);
      const after = drop(p, obj, n).p;
      if (/^(bai )?(cua )?(toi|minh|em|tui)$/.test(after)) t.mine = true;
      else t.all = true;
      continue;
    }
    const last = LAST.exec(p);
    if (last) {
      const w = last[1];
      t.last = /^\d+$/.test(w) ? Number(w) : (NUMBERS[w] ?? 1);
      t.mine = true;
      continue;
    }
    let title = tail(drop(p, obj, lead(p, ONE)).original, 0);
    // "Nàng Thơ của tôi": the title without the owner.
    if (/ cua (toi|minh|em|tui)$/.test(plain(title))) {
      const ws = words(title);
      title = ws.slice(0, ws.length - 2).join(' ');
    }
    if (title) (t.titles ??= []).push(title);
  }
  return Object.keys(t).length ? t : null;
}

function multiTarget(t: Target): boolean {
  return Boolean(
    t.all || t.mine || t.by || t.last || (t.titles?.length ?? 0) > 1,
  );
}

/** A request the DJ carries out itself, or null (a single task: the rules answer it). */
export function planCombo(request: string): Plan | null {
  const { rest, wish } = extractWish(request.trim());
  const segs = rest.split(SEP).filter((s) => s.trim());
  if (!segs.length) return null;

  // Each verb starts a task; the segments after it without a verb are more of its objects.
  const clauses: { verb: Verb; objs: string[] }[] = [];
  for (const seg of segs) {
    const v = verbOf(seg);
    if (v) clauses.push({ verb: v.verb, objs: v.rest ? [v.rest] : [] });
    else if (clauses.length) clauses[clauses.length - 1].objs.push(seg.trim());
    else return null;
  }

  const steps: PlanStep[] = [];
  for (const { verb, objs } of clauses) {
    switch (verb) {
      case 'add':
      case 'addAgain': {
        const adds: PlanStep[] = [];
        for (const obj of objs.length ? objs : [''])
          if (obj || verb === 'addAgain') {
            const s = addObject(obj, verb === 'addAgain');
            if (s) adds.push(s);
          }
        // "thêm Lạc Trôi và Nàng Thơ": one add of several titles.
        const titles = adds.filter((s) => s.do === 'add');
        if (titles.length > 1) {
          const first = adds.indexOf(titles[0]);
          adds.splice(first, 1, {
            do: 'add',
            titles: titles.flatMap((s) => s.titles),
            pin: titles.find((s) => s.pin)?.pin,
          });
          for (const s of titles.slice(1)) adds.splice(adds.indexOf(s), 1);
        }
        steps.push(...adds);
        break;
      }
      case 'heart':
      case 'remove': {
        const target = targetOf(objs);
        if (target) steps.push({ do: verb, target });
        break;
      }
      case 'replace': {
        const obj = objs.join(' ');
        const p = plain(obj);
        const m = INTO.exec(p);
        if (!m) break;
        const at = p.slice(0, m.index).split(' ').length;
        const ws = words(obj);
        const from = targetOf([ws.slice(0, at).join(' ')]);
        const to = ws.slice(at + 1).join(' ');
        const title = from?.titles?.[0];
        if (title && to)
          steps.push({ do: 'replace', from: title, to: tail(to, 0) });
        break;
      }
      default:
        steps.push({ do: verb });
    }
  }
  if (!steps.length) return null;

  const adds = steps.some((s) => s.do.startsWith('add') || s.do === 'replace');
  const combo =
    steps.length > 1 ||
    (Boolean(wish) && adds) ||
    steps.some(
      (s) =>
        (s.do === 'add' && (s.titles.length > 1 || s.pin)) ||
        (s.do === 'addArtist' && (s.count > 1 || s.mode === 'top' || s.pin)) ||
        (s.do === 'addVague' && (s.count > 1 || s.pin)) ||
        s.do === 'addFrom' ||
        ((s.do === 'heart' || s.do === 'remove') && multiTarget(s.target)) ||
        s.do === 'replace',
    );
  if (!combo) return null;
  return { steps, ...(wish && adds ? { wish } : {}) };
}
