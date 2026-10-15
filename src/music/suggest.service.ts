import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { ENV, type Env } from '../config/env';
import {
  normalizeQuery,
  type RoomSettings,
  type SuggestionReason,
  type SuggestionView,
} from '../contracts';
import type { Track } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { toTrackSummary } from '../state/views';
import { LastFmService } from './lastfm.service';

/** Shown on the room screen (A3). */
const MAX_TRACKS = 8;
const MAX_SEARCH = 3;
/** Plays looked at for "the room often plays this next" and "the room's favourites". */
const HISTORY_SCAN = 2000;
/** Radio (A4) never repeats a song the room started within this window. */
export const RADIO_NO_REPEAT_MS = 3 * 3600_000;
const WARM_MS = 6 * 3600_000;
/** AI5: how long an AI-ordered radio plan stays usable, and how many it orders. */
const PLAN_MS = 15 * 60_000;
const PLAN_CANDIDATES = 15;

const RADIO_SYSTEM = `Bạn chọn nhạc cho radio của một văn phòng. Dựa vào giờ trong ngày và phản ứng gần đây của
cả phòng (bài nghe hết, bài bị bỏ qua, số tim), xếp 5 ứng viên hợp nhất để phát tiếp, hợp nhất trước.
Tránh chọn liền nhiều bài cùng nghệ sĩ. Chỉ dùng số "i" của ứng viên.
Trả lời đúng JSON: {"order":[<i>, ...]}.`;

type Db = PrismaService | Tx;
type Candidate = { id: string; reason: SuggestionReason };
type LastFmPart = {
  known: string[];
  unknown: { artist: string; song: string }[];
};

/**
 * Songs to play next, cheapest sources only: Last.fm (similar tracks / artists, mapped
 * onto songs this server already has), this room's history, the same artist, and the
 * room's favourites. Every `track` suggestion can be queued without YouTube quota.
 */
@Injectable()
export class SuggestService {
  private readonly logger = new Logger(SuggestService.name);
  /** Last.fm part per seed track, so the radio can pick inside a transaction without I/O. */
  private readonly warm = new Map<string, { at: number; part: LastFmPart }>();

  /** AI5: per room, the radio's next picks in the AI's order. */
  private readonly plans = new Map<string, { at: number; ids: string[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lastfm: LastFmService,
    private readonly ai: AiService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------ Last.fm part (no transaction)

  private async lastFmPart(seed: Track): Promise<LastFmPart> {
    const empty: LastFmPart = { known: [], unknown: [] };
    if (!this.lastfm.enabled || !seed.artist || !seed.song) return empty;
    const cached = this.warm.get(seed.id);
    if (cached && Date.now() - cached.at < WARM_MS) return cached.part;

    const similar = await this.lastfm.similarTracks(seed.artist, seed.song);
    const pairs = similar.map((s) => ({
      ...s,
      artistKey: normalizeQuery(s.artist),
      songKey: normalizeQuery(s.song),
    }));
    const matched = pairs.length
      ? await this.prisma.track.findMany({
          where: {
            OR: pairs.map((p) => ({
              artistKey: p.artistKey,
              songKey: p.songKey,
            })),
            embeddable: true,
            title: { not: '' },
          },
          select: { id: true, artistKey: true, songKey: true },
        })
      : [];
    const byPair = new Map(
      matched.map((t) => [`${t.artistKey}|${t.songKey}`, t.id]),
    );
    const known: string[] = [];
    const unknown: LastFmPart['unknown'] = [];
    for (const p of pairs) {
      const id = byPair.get(`${p.artistKey}|${p.songKey}`);
      if (id) known.push(id);
      else if (unknown.length < MAX_SEARCH * 2)
        unknown.push({ artist: p.artist, song: p.song });
    }
    // Few known similar songs: fall back to known songs by similar artists (two each).
    if (known.length < MAX_TRACKS) {
      const artists = (await this.lastfm.similarArtists(seed.artist)).map(
        normalizeQuery,
      );
      if (artists.length) {
        const byArtist = await this.prisma.track.findMany({
          where: {
            artistKey: { in: artists },
            embeddable: true,
            title: { not: '' },
          },
          select: { id: true, artistKey: true },
          take: 200,
        });
        for (const a of artists) {
          for (const t of byArtist.filter((x) => x.artistKey === a).slice(0, 2))
            if (!known.includes(t.id)) known.push(t.id);
        }
      }
    }
    const part = { known, unknown };
    this.warm.set(seed.id, { at: Date.now(), part });
    if (this.warm.size > 500)
      this.warm.delete(this.warm.keys().next().value as string);
    return part;
  }

  /** Called when a song starts, so the radio has Last.fm picks ready for when it ends. */
  async warmFor(trackId: string): Promise<void> {
    try {
      const seed = await this.prisma.track.findUnique({
        where: { id: trackId },
      });
      if (seed) await this.lastFmPart(seed);
    } catch (e) {
      this.logger.warn(`warm ${trackId} failed: ${String(e)}`);
    }
  }

  // ------------------------------------------------------------ database part (works in a transaction)

  private async dbPart(
    db: Db,
    roomId: string,
    seed: Track | null,
  ): Promise<Candidate[]> {
    const plays = await db.queueItem.findMany({
      where: {
        roomId,
        status: { in: ['PLAYED', 'SKIPPED', 'PLAYING'] },
        startedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
      take: HISTORY_SCAN,
      select: { trackId: true, _count: { select: { hearts: true } } },
    });
    const out: Candidate[] = [];
    if (seed) {
      // What this room played right after the seed, most often first. plays is newest first.
      const next = new Map<string, number>();
      for (let i = 1; i < plays.length; i++)
        if (plays[i].trackId === seed.id && plays[i - 1].trackId !== seed.id)
          next.set(
            plays[i - 1].trackId,
            (next.get(plays[i - 1].trackId) ?? 0) + 1,
          );
      for (const [id] of [...next].sort((a, b) => b[1] - a[1]))
        out.push({ id, reason: 'room' });
      if (seed.artistKey) {
        const same = await db.track.findMany({
          where: {
            artistKey: seed.artistKey,
            id: { not: seed.id },
            embeddable: true,
            title: { not: '' },
          },
          select: { id: true },
          take: 10,
        });
        for (const t of same) out.push({ id: t.id, reason: 'artist' });
      }
    }
    // The room's favourites: hearts first, then plays.
    const score = new Map<string, number>();
    for (const p of plays)
      score.set(
        p.trackId,
        (score.get(p.trackId) ?? 0) + 1 + 2 * p._count.hearts,
      );
    for (const [id] of [...score].sort((a, b) => b[1] - a[1]).slice(0, 20))
      out.push({ id, reason: 'popular' });
    return out;
  }

  /** Drops the seed, songs already queued or on air, and songs the room's rules refuse. */
  private async eligible(
    db: Db,
    roomId: string,
    candidates: Candidate[],
    settings: RoomSettings,
    extraExclude: Set<string>,
  ): Promise<{ c: Candidate; t: Track }[]> {
    const waiting = await db.queueItem.findMany({
      where: { roomId, status: { in: ['QUEUED', 'PLAYING'] } },
      select: { trackId: true },
    });
    const skip = new Set([...extraExclude, ...waiting.map((w) => w.trackId)]);
    const seen = new Set<string>();
    const unique = candidates.filter(
      (c) => !skip.has(c.id) && !seen.has(c.id) && seen.add(c.id),
    );
    const tracks = await db.track.findMany({
      where: { id: { in: unique.map((c) => c.id) } },
    });
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const max = settings.maxTrackDurationSec;
    return unique
      .map((c) => ({ c, t: byId.get(c.id) }))
      .filter(
        (x): x is { c: Candidate; t: Track } =>
          Boolean(x.t) &&
          x.t!.embeddable &&
          x.t!.title !== '' &&
          (max === 0 || x.t!.durationSec === null || x.t!.durationSec <= max),
      );
  }

  // ------------------------------------------------------------ A3

  async forRoom(
    roomId: string,
    seedId: string | null,
    settings: RoomSettings,
  ): Promise<SuggestionView[]> {
    let id = seedId;
    if (!id) {
      const ps = await this.prisma.playbackState.findUnique({
        where: { roomId },
      });
      const item = ps?.currentItemId
        ? await this.prisma.queueItem.findUnique({
            where: { id: ps.currentItemId },
            select: { trackId: true },
          })
        : null;
      id = item?.trackId ?? null;
    }
    const seed = id
      ? await this.prisma.track.findUnique({ where: { id } })
      : null;
    const lf = seed ? await this.lastFmPart(seed) : { known: [], unknown: [] };
    const candidates: Candidate[] = [
      ...lf.known.map((k) => ({ id: k, reason: 'similar' as const })),
      ...(await this.dbPart(this.prisma, roomId, seed)),
    ];
    const picks = await this.eligible(
      this.prisma,
      roomId,
      candidates,
      settings,
      new Set(seed ? [seed.id] : []),
    );
    const items: SuggestionView[] = picks
      .slice(0, MAX_TRACKS)
      .map(({ c, t }) => ({
        kind: 'track',
        track: toTrackSummary(t),
        reason: c.reason,
      }));
    for (const u of lf.unknown.slice(0, MAX_SEARCH))
      items.push({
        kind: 'search',
        artist: u.artist,
        song: u.song,
        reason: 'similar',
      });
    return items;
  }

  // ------------------------------------------------------------ A4

  /** Next radio song (a known track id) or null. Runs inside the room transaction: no network. */
  async radioPick(
    tx: Tx,
    roomId: string,
    settings: RoomSettings,
    now: Date,
  ): Promise<string | null> {
    const last = await tx.queueItem.findFirst({
      where: { roomId, startedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      include: { track: true },
    });
    const seed = last?.track ?? null;
    const warm = seed ? (this.warm.get(seed.id)?.part.known ?? []) : [];
    const recent = await tx.queueItem.findMany({
      where: {
        roomId,
        startedAt: { gte: new Date(now.getTime() - RADIO_NO_REPEAT_MS) },
      },
      select: { trackId: true },
    });
    const plan = this.plans.get(roomId);
    const planned = plan && Date.now() - plan.at < PLAN_MS ? plan.ids : [];
    const candidates: Candidate[] = [
      ...planned.map((k) => ({ id: k, reason: 'similar' as const })),
      ...warm.map((k) => ({ id: k, reason: 'similar' as const })),
      ...(await this.dbPart(tx, roomId, seed)),
    ];
    // The AI already ordered the best few: take its first that is still allowed.
    if (planned.length) {
      const ok = await this.eligible(
        tx,
        roomId,
        planned.map((k) => ({ id: k, reason: 'similar' as const })),
        settings,
        new Set(recent.map((r) => r.trackId)),
      );
      if (ok.length) return ok[0].c.id;
    }
    const picks = await this.eligible(
      tx,
      roomId,
      candidates,
      settings,
      new Set(recent.map((r) => r.trackId)),
    );
    if (!picks.length) return null;
    // A little variety among the best few, so two rooms with the same history differ.
    return picks[Math.floor(Math.random() * Math.min(3, picks.length))].c.id;
  }

  /**
   * AI5: when a song starts in a room with the radio on, order the next few picks
   * outside any transaction — by time of day and how the room reacted lately (songs
   * heard to the end, skipped, hearted). Without AI the plan is simply not made.
   */
  async planRadio(roomId: string, settings: RoomSettings): Promise<void> {
    if (!this.ai.enabled) return;
    try {
      const last = await this.prisma.queueItem.findFirst({
        where: { roomId, startedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        include: { track: true },
      });
      const seed = last?.track ?? null;
      const lf = seed
        ? await this.lastFmPart(seed)
        : { known: [], unknown: [] };
      const recent = await this.prisma.queueItem.findMany({
        where: {
          roomId,
          startedAt: { gte: new Date(Date.now() - RADIO_NO_REPEAT_MS) },
        },
        orderBy: { startedAt: 'desc' },
        include: { track: true, _count: { select: { hearts: true } } },
      });
      const candidates = await this.eligible(
        this.prisma,
        roomId,
        [
          ...lf.known.map((k) => ({ id: k, reason: 'similar' as const })),
          ...(await this.dbPart(this.prisma, roomId, seed)),
        ],
        settings,
        new Set(recent.map((r) => r.trackId)),
      );
      const pool = candidates.slice(0, PLAN_CANDIDATES);
      if (pool.length < 2) return;
      const name = (t: Track) => ({
        song: t.song ?? t.title,
        artist: t.artist,
      });
      const when = new Intl.DateTimeFormat('vi-VN', {
        timeZone: this.env.ROOM_TIMEZONE,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
      const answer = await this.ai.json<{ order?: number[] }>(
        'radio',
        RADIO_SYSTEM,
        JSON.stringify({
          now: when,
          recent: recent.slice(0, 8).map((r) => ({
            ...name(r.track),
            outcome:
              r.status === 'SKIPPED'
                ? 'bị bỏ qua'
                : r.status === 'PLAYING'
                  ? 'đang phát'
                  : 'nghe hết',
            hearts: r._count.hearts,
          })),
          candidates: pool.map((p, i) => ({ i, ...name(p.t) })),
        }),
        { temperature: 0.5 },
      );
      const ids = (answer?.order ?? [])
        .filter((i) => Number.isInteger(i) && pool[i])
        .map((i) => pool[i].c.id);
      if (ids.length) {
        this.plans.set(roomId, { at: Date.now(), ids: [...new Set(ids)] });
        this.logger.log(
          `Radio plan for room ${roomId}: ${ids.length} of ${pool.length} candidates`,
        );
      }
    } catch (e) {
      this.logger.warn(`radio plan for ${roomId} failed: ${String(e)}`);
    }
  }
}
