import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AppError } from '../common/app-error';
import {
  type CommandResults,
  LIBRARY_LIMIT,
  type LibraryItemView,
  type LibrarySort,
  type RecapView,
  type TrackSummary,
} from '../contracts';
import type { Track } from '../generated/prisma/client';
import {
  TRACK_TTL_MS,
  TrackCacheService,
  trackId,
} from '../music/track-cache.service';
import { YouTubeProvider } from '../music/youtube.provider';
import { PrismaService } from '../prisma/prisma.service';
import { Broadcaster } from '../realtime/broadcaster.service';
import type { Actor } from '../state/room-state.service';
import { toTrackSummary } from '../state/views';

/** Plays scanned per library request: plenty for an office room, bounded for the DB. */
const HISTORY_SCAN = 3000;
/** Without an API key each unknown id costs one oEmbed call: keep lookups short. */
const LOOKUP_WITHOUT_API = 10;

/** The retention job blanks the title of videos it may no longer keep: never show those. */
const shown = (t: Track) => t.title !== '';

/** A1 (the room's played songs) and A2 (a member's saved songs, "Lưu"). */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracks: TrackCacheService,
    private readonly youtube: YouTubeProvider,
    private readonly broadcaster: Broadcaster,
    private readonly ai: AiService,
  ) {}

  private readonly recapComments = new Map<
    string,
    { at: number; text: string | null }
  >();

  // ------------------------------------------------------------ A1: Đã phát

  async roomLibrary(
    actor: Actor,
    sort: LibrarySort,
  ): Promise<CommandResults['library:room']> {
    const plays = await this.prisma.queueItem.findMany({
      where: {
        roomId: actor.roomId,
        status: { in: ['PLAYED', 'SKIPPED'] },
        startedAt: { not: null },
      },
      orderBy: { startedAt: 'desc' },
      take: HISTORY_SCAN,
      select: {
        startedAt: true,
        track: true,
        addedBy: { select: { id: true, displayName: true } },
        _count: { select: { hearts: true } },
      },
    });
    // Newest play first, so the first row seen for a track carries its last play.
    const byTrack = new Map<string, LibraryItemView>();
    for (const p of plays) {
      if (!shown(p.track)) continue;
      const row = byTrack.get(p.track.id);
      if (row) {
        row.plays += 1;
        row.hearts += p._count.hearts;
        continue;
      }
      byTrack.set(p.track.id, {
        track: toTrackSummary(p.track),
        plays: 1,
        hearts: p._count.hearts,
        lastPlayedAt: (p.startedAt as Date).toISOString(),
        lastAddedBy: p.addedBy,
      });
    }
    const items = [...byTrack.values()];
    const recent = (a: LibraryItemView, b: LibraryItemView) =>
      b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    if (sort === 'loved')
      items.sort(
        (a, b) => b.hearts - a.hearts || b.plays - a.plays || recent(a, b),
      );
    else if (sort === 'most')
      items.sort(
        (a, b) => b.plays - a.plays || b.hearts - a.hearts || recent(a, b),
      );
    else items.sort(recent);
    return { items: items.slice(0, LIBRARY_LIMIT) };
  }

  // ------------------------------------------------------------ A2: Lưu

  private async requirePerson(actor: Actor): Promise<void> {
    const m = await this.prisma.member.findUnique({
      where: { id: actor.memberId },
    });
    if (!m || m.leftAt || m.kickedAt) throw new AppError('UNAUTHENTICATED');
    // The speaker page is a shared device, not a person.
    if (m.isDevice) throw new AppError('FORBIDDEN');
  }

  async setFavorite(
    actor: Actor,
    id: string,
    saved: boolean,
  ): Promise<CommandResults['favorite:set']> {
    await this.requirePerson(actor);
    if (saved) {
      const track = await this.prisma.track.findUnique({ where: { id } });
      if (!track || !shown(track)) throw new AppError('TRACK_NOT_FOUND');
      await this.prisma.favorite.upsert({
        where: { memberId_trackId: { memberId: actor.memberId, trackId: id } },
        create: { memberId: actor.memberId, trackId: id },
        update: {},
      });
    } else {
      await this.prisma.favorite.deleteMany({
        where: { memberId: actor.memberId, trackId: id },
      });
    }
    await this.pushIds(actor.memberId);
    return { saved };
  }

  async listFavorites(actor: Actor): Promise<CommandResults['favorite:list']> {
    await this.requirePerson(actor);
    const rows = await this.prisma.favorite.findMany({
      where: { memberId: actor.memberId },
      orderBy: { createdAt: 'desc' },
      include: { track: true },
    });
    return {
      tracks: rows
        .filter((r) => shown(r.track))
        .map((r) => toTrackSummary(r.track)),
    };
  }

  /** Sends the member's saved track ids to all of their tabs (not part of the room snapshot). */
  async pushIds(memberId: string): Promise<void> {
    const rows = await this.prisma.favorite.findMany({
      where: { memberId },
      select: { trackId: true },
    });
    this.broadcaster.toMember(memberId, 'favorite:ids', {
      trackIds: rows.map((r) => r.trackId),
    });
  }

  // ------------------------------------------------------------ lookup

  /**
   * Name and artwork for video ids (saved on this device in other rooms). Known, fresh
   * tracks cost nothing; the rest is one videos.list call per 50 ids with an API key, or
   * a few single lookups without one. Unknown or unplayable ids are left out.
   */
  async lookup(videoIds: string[]): Promise<CommandResults['tracks:lookup']> {
    const ids = [...new Set(videoIds)];
    const rows = await this.prisma.track.findMany({
      where: { id: { in: ids.map(trackId) } },
    });
    const found = new Map(rows.map((t) => [t.externalId, t]));
    const now = Date.now();
    const missing = ids.filter((v) => {
      const t = found.get(v);
      return !t || now - t.fetchedAt.getTime() >= TRACK_TTL_MS;
    });
    if (missing.length) {
      try {
        if (this.youtube.apiUsable) {
          const infos = await this.youtube.videos(missing);
          for (const info of infos.values())
            found.set(info.externalId, await this.tracks.upsert(info));
        } else {
          for (const v of missing.slice(0, LOOKUP_WITHOUT_API)) {
            const t = await this.tracks.resolve(v).catch(() => null);
            if (t) found.set(v, t);
          }
        }
      } catch (e) {
        // Quota or network: answer with what is already known.
        this.logger.warn(`tracks:lookup refresh failed: ${String(e)}`);
      }
    }
    const tracks: TrackSummary[] = [];
    for (const v of ids) {
      const t = found.get(v);
      if (t && shown(t) && t.embeddable) tracks.push(toTrackSummary(t));
    }
    return { tracks };
  }

  // ------------------------------------------------------------ A8: Tổng kết

  /**
   * What the room played since `since` (at most 31 days back): counts, top songs, top
   * pickers, plays per local hour, and a one-line AI comment (cached 10 minutes).
   */
  async recap(
    actor: Actor,
    sinceIso: string,
    tzOffsetMinutes: number,
  ): Promise<RecapView> {
    const now = Date.now();
    const since = new Date(
      Math.max(new Date(sinceIso).getTime(), now - 31 * 24 * 3600_000),
    );
    const plays = await this.prisma.queueItem.findMany({
      where: {
        roomId: actor.roomId,
        startedAt: { gte: since },
        status: { in: ['PLAYED', 'SKIPPED', 'PLAYING'] },
      },
      include: {
        track: true,
        addedBy: { select: { id: true, displayName: true } },
        _count: { select: { hearts: true } },
      },
    });
    let ms = 0;
    const byHour = Array.from({ length: 24 }, () => 0);
    const songs = new Map<
      string,
      { track: Track; plays: number; hearts: number }
    >();
    const pickers = new Map<
      string,
      {
        member: { id: string; displayName: string };
        songs: number;
        hearts: number;
      }
    >();
    for (const p of plays) {
      const start = (p.startedAt as Date).getTime();
      const end = p.endedAt?.getTime() ?? now;
      const cap = p.track.durationSec ? p.track.durationSec * 1000 : Infinity;
      ms += Math.max(0, Math.min(end - start, cap));
      // getTimezoneOffset() is UTC − local, in minutes.
      const local = new Date(start - tzOffsetMinutes * 60_000);
      byHour[local.getUTCHours()] += 1;
      if (shown(p.track)) {
        const s = songs.get(p.track.id) ?? {
          track: p.track,
          plays: 0,
          hearts: 0,
        };
        s.plays += 1;
        s.hearts += p._count.hearts;
        songs.set(p.track.id, s);
      }
      if (p.addedBy) {
        const k = pickers.get(p.addedBy.id) ?? {
          member: p.addedBy,
          songs: 0,
          hearts: 0,
        };
        k.songs += 1;
        k.hearts += p._count.hearts;
        pickers.set(p.addedBy.id, k);
      }
    }
    const topSongs = [...songs.values()]
      .sort((a, b) => b.plays - a.plays || b.hearts - a.hearts)
      .slice(0, 5)
      .map((s) => ({
        track: toTrackSummary(s.track),
        plays: s.plays,
        hearts: s.hearts,
      }));
    const topPickers = [...pickers.values()]
      .sort((a, b) => b.hearts - a.hearts || b.songs - a.songs)
      .slice(0, 5);
    const view: RecapView = {
      plays: plays.length,
      minutes: Math.round(ms / 60_000),
      skipped: plays.filter((p) => p.status === 'SKIPPED').length,
      topSongs,
      topPickers,
      byHour,
      summary: null,
    };
    view.summary = await this.recapComment(
      `${actor.roomId}|${since.toISOString()}`,
      view,
    );
    return view;
  }

  private async recapComment(
    key: string,
    v: RecapView,
  ): Promise<string | null> {
    if (!this.ai.enabled || v.plays === 0) return null;
    const hit = this.recapComments.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.text;
    const answer = await this.ai.json<{ summary?: string }>(
      'recap',
      `Bạn viết MỘT câu nhận xét vui, thân thiện (tối đa 30 từ, tiếng Việt) về việc nghe nhạc của một văn phòng.
Chỉ dùng đúng các con số trong "facts", không suy ra số khác, không bịa thêm. Không emoji. Trả lời JSON {"summary":<string>}.`,
      JSON.stringify({
        facts: {
          songsPlayed: v.plays,
          minutesOfMusic: v.minutes,
          songsSkipped: v.skipped,
          busiestHour: `${v.byHour.indexOf(Math.max(...v.byHour))}:00`,
        },
        topSongs: v.topSongs.map((s) => ({
          song: s.track.song ?? s.track.title,
          artist: s.track.artist,
          timesPlayed: s.plays,
          hearts: s.hearts,
        })),
        topPickers: v.topPickers.map((p) => ({
          name: p.member.displayName,
          songsPlayed: p.songs,
          heartsReceived: p.hearts,
        })),
      }),
      { temperature: 0.5 },
    );
    const text =
      typeof answer?.summary === 'string'
        ? answer.summary.trim().slice(0, 300) || null
        : null;
    this.recapComments.set(key, { at: Date.now(), text });
    if (this.recapComments.size > 200)
      this.recapComments.delete(
        this.recapComments.keys().next().value as string,
      );
    return text;
  }
}
