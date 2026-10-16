import { Injectable } from '@nestjs/common';
import {
  normalizeQuery,
  type RoomSettings,
  type SuggestionReason,
  type SuggestionView,
} from '../contracts';
import type { Track } from '../generated/prisma/client';
import { LastFmService } from '../music/lastfm.service';
import { PlaylistsService } from '../playlists/playlists.service';
import { PrismaService } from '../prisma/prisma.service';
import { toTrackSummary } from '../state/views';

const PROFILE_MS = 10 * 60_000;
const RECENT_MS = 3 * 24 * 3600_000;
const TOP_ARTISTS = 8;
const PER_SOURCE = 4;
const MAX_ITEMS = 12;
const MIX_SOURCE = 'mix:foryou';
const MIX_NAME = 'Dành cho bạn';

const W = { favorite: 4, heart: 3, played: 2, playlist: 2, skip: -3 } as const;

interface Profile {
  at: number;
  /** Score per track id (can be negative). */
  tracks: Map<string, number>;
  /** artistKey → { name, score }, best first. */
  artists: { key: string; name: string; score: number }[];
  /** Hearted or saved: what "people like me" are matched on. */
  liked: Set<string>;
  /** Never suggest these: saved, in my playlists, skipped, or played in my rooms lately. */
  exclude: Set<string>;
  memberIds: string[];
}

type Pick = { t: Track; reason: SuggestionReason; because?: string };

/**
 * L5: suggestions for one signed-in person, from what their account did in every
 * room — saves, hearts, songs they added, playlists, skip votes. Only songs the server
 * already knows (no YouTube quota), no AI.
 */
@Injectable()
export class TasteService {
  private readonly profiles = new Map<string, Profile>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lastfm: LastFmService,
    private readonly playlists: PlaylistsService,
  ) {}

  private async profile(userId: string): Promise<Profile> {
    const hit = this.profiles.get(userId);
    if (hit && Date.now() - hit.at < PROFILE_MS) return hit;

    const members = await this.prisma.member.findMany({
      where: { userId },
      select: { id: true, roomId: true },
    });
    const memberIds = members.map((m) => m.id);
    const roomIds = [...new Set(members.map((m) => m.roomId))];
    const [favs, hearts, played, inPlaylists, skips, recent] =
      await Promise.all([
        this.prisma.userFavorite.findMany({
          where: { userId },
          select: { trackId: true },
        }),
        this.prisma.heart.findMany({
          where: { memberId: { in: memberIds } },
          select: { queueItem: { select: { trackId: true } } },
        }),
        this.prisma.queueItem.findMany({
          where: { addedById: { in: memberIds }, startedAt: { not: null } },
          select: { trackId: true },
        }),
        this.prisma.playlistItem.findMany({
          where: { playlist: { ownerId: userId } },
          select: { trackId: true },
        }),
        // Only ✅: a ❌ ("keep listening") is not a dislike.
        this.prisma.skipVote.findMany({
          where: { memberId: { in: memberIds }, approve: true },
          select: { queueItem: { select: { trackId: true } } },
        }),
        this.prisma.queueItem.findMany({
          where: {
            roomId: { in: roomIds },
            startedAt: { gte: new Date(Date.now() - RECENT_MS) },
          },
          select: { trackId: true },
        }),
      ]);

    const tracks = new Map<string, number>();
    const add = (id: string, w: number) =>
      tracks.set(id, (tracks.get(id) ?? 0) + w);
    favs.forEach((f) => add(f.trackId, W.favorite));
    hearts.forEach((h) => add(h.queueItem.trackId, W.heart));
    played.forEach((p) => add(p.trackId, W.played));
    inPlaylists.forEach((p) => add(p.trackId, W.playlist));
    skips.forEach((s) => add(s.queueItem.trackId, W.skip));

    const meta = await this.prisma.track.findMany({
      where: { id: { in: [...tracks.keys()] }, artistKey: { not: null } },
      select: { id: true, artist: true, artistKey: true },
    });
    const skipped = new Set(skips.map((s) => s.queueItem.trackId));
    const byArtist = new Map<string, { name: string; score: number }>();
    for (const t of meta) {
      const a = byArtist.get(t.artistKey!) ?? {
        name: t.artist ?? t.artistKey!,
        score: 0,
      };
      // A skipped song only nudges its artist down; it does not cancel the artist.
      a.score += skipped.has(t.id) ? -1 : Math.max(0, tracks.get(t.id) ?? 0);
      byArtist.set(t.artistKey!, a);
    }
    const artists = [...byArtist.entries()]
      .map(([key, a]) => ({ key, ...a }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);

    const liked = new Set([
      ...favs.map((f) => f.trackId),
      ...hearts.map((h) => h.queueItem.trackId),
    ]);
    const profile: Profile = {
      at: Date.now(),
      tracks,
      artists,
      liked,
      exclude: new Set([
        ...favs.map((f) => f.trackId),
        ...inPlaylists.map((p) => p.trackId),
        ...skipped,
        ...recent.map((r) => r.trackId),
      ]),
      memberIds,
    };
    this.profiles.set(userId, profile);
    if (this.profiles.size > 500)
      this.profiles.delete(this.profiles.keys().next().value as string);
    return profile;
  }

  /** "Người cùng gu cũng thích": what accounts / members with the same saves and hearts like. */
  private async peers(userId: string, p: Profile): Promise<string[]> {
    if (!p.liked.size) return [];
    const liked = [...p.liked];
    const [peerUsers, peerMembers] = await Promise.all([
      this.prisma.userFavorite.findMany({
        where: { trackId: { in: liked }, userId: { not: userId } },
        select: { userId: true },
      }),
      this.prisma.heart.findMany({
        where: {
          queueItem: { trackId: { in: liked } },
          memberId: { notIn: p.memberIds },
        },
        select: { memberId: true },
      }),
    ]);
    const overlapUser = new Map<string, number>();
    peerUsers.forEach((u) =>
      overlapUser.set(u.userId, (overlapUser.get(u.userId) ?? 0) + 1),
    );
    const overlapMember = new Map<string, number>();
    peerMembers.forEach((m) =>
      overlapMember.set(m.memberId, (overlapMember.get(m.memberId) ?? 0) + 1),
    );
    if (!overlapUser.size && !overlapMember.size) return [];
    const [theirFavs, theirHearts] = await Promise.all([
      this.prisma.userFavorite.findMany({
        where: { userId: { in: [...overlapUser.keys()] } },
        select: { userId: true, trackId: true },
      }),
      this.prisma.heart.findMany({
        where: { memberId: { in: [...overlapMember.keys()] } },
        select: { memberId: true, queueItem: { select: { trackId: true } } },
      }),
    ]);
    const score = new Map<string, number>();
    theirFavs.forEach((f) =>
      score.set(
        f.trackId,
        (score.get(f.trackId) ?? 0) + (overlapUser.get(f.userId) ?? 0),
      ),
    );
    theirHearts.forEach((h) =>
      score.set(
        h.queueItem.trackId,
        (score.get(h.queueItem.trackId) ?? 0) +
          (overlapMember.get(h.memberId) ?? 0),
      ),
    );
    return [...score.entries()]
      .filter(([id]) => !p.liked.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }

  async forMe(
    userId: string,
    room: { roomId: string; settings: RoomSettings } | null,
  ): Promise<{ items: SuggestionView[]; topArtists: string[] }> {
    const p = await this.profile(userId);
    const top = p.artists.slice(0, TOP_ARTISTS);
    const waiting = room
      ? (
          await this.prisma.queueItem.findMany({
            where: {
              roomId: room.roomId,
              status: { in: ['QUEUED', 'PLAYING'] },
            },
            select: { trackId: true },
          })
        ).map((w) => w.trackId)
      : [];
    const skip = new Set([...p.exclude, ...waiting]);
    const max = room?.settings.maxTrackDurationSec ?? 0;
    const ok = (t: Track | undefined): t is Track =>
      Boolean(t) &&
      t!.embeddable &&
      t!.title !== '' &&
      !skip.has(t!.id) &&
      (max === 0 || t!.durationSec === null || t!.durationSec <= max);

    // 1. people with the same taste
    const peerIds = (await this.peers(userId, p)).slice(0, 40);
    const peerTracks = await this.prisma.track.findMany({
      where: { id: { in: peerIds } },
    });
    const peerById = new Map(peerTracks.map((t) => [t.id, t]));
    const fromPeers: Pick[] = peerIds
      .map((id) => peerById.get(id))
      .filter(ok)
      .map((t) => ({ t, reason: 'peers' }));

    // 2. more by the artists I like
    const byArtist = await this.prisma.track.findMany({
      where: {
        artistKey: { in: top.map((a) => a.key) },
        embeddable: true,
        title: { not: '' },
      },
      orderBy: { fetchedAt: 'desc' },
      take: 120,
    });
    const fromArtists: Pick[] = [];
    for (const a of top)
      for (const t of byArtist
        .filter((x) => x.artistKey === a.key && ok(x))
        .slice(0, 2))
        fromArtists.push({ t, reason: 'taste', because: a.name });

    // 3. artists similar to my top three (Last.fm, cached)
    const fromSimilar: Pick[] = [];
    for (const a of top.slice(0, 3)) {
      const similar = (await this.lastfm.similarArtists(a.name)).map(
        normalizeQuery,
      );
      if (!similar.length) continue;
      const tracks = await this.prisma.track.findMany({
        where: {
          artistKey: { in: similar },
          embeddable: true,
          title: { not: '' },
        },
        take: 60,
      });
      for (const key of similar)
        for (const t of tracks
          .filter((x) => x.artistKey === key && ok(x))
          .slice(0, 1))
          fromSimilar.push({ t, reason: 'taste-similar', because: a.name });
    }

    // Interleave the three sources so no single one fills the list.
    const sources = [fromPeers, fromArtists, fromSimilar].map((s) =>
      s.slice(0, PER_SOURCE * 3),
    );
    const seen = new Set<string>();
    const items: SuggestionView[] = [];
    for (
      let i = 0;
      items.length < MAX_ITEMS && sources.some((s) => i < s.length);
      i++
    )
      for (const s of sources) {
        const pick = s[i];
        if (!pick || seen.has(pick.t.id) || items.length >= MAX_ITEMS) continue;
        seen.add(pick.t.id);
        items.push({
          kind: 'track',
          track: toTrackSummary(pick.t),
          reason: pick.reason,
          ...(pick.because ? { because: pick.because } : {}),
        });
      }
    return { items, topArtists: top.map((a) => a.name) };
  }

  /** "Dành cho bạn" as a personal playlist, updated in place on every save. */
  async saveMix(
    userId: string,
  ): Promise<{ playlistId: string; count: number }> {
    const { items } = await this.forMe(userId, null);
    const ids = items.flatMap((i) => (i.kind === 'track' ? [i.track.id] : []));
    const playlistId = await this.playlists.saveFromSource(
      userId,
      MIX_SOURCE,
      MIX_NAME,
      ids,
    );
    return { playlistId, count: ids.length };
  }
}
