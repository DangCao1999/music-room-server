import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { type CommandResults, parseYouTubePlaylist } from '../contracts';
import { toTrackSummary } from '../state/views';
import { PrismaService } from '../prisma/prisma.service';
import { TrackCacheService } from './track-cache.service';
import { type TrackInfo, YouTubeProvider } from './youtube.provider';

export const PLAYLIST_TTL_MS = 24 * 3600_000;

/**
 * Fallback playlist (R-31). Resolved outside transactions and cached in
 * PlaylistCache so `advance` can pick a track without any network call.
 */
@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeProvider,
    private readonly tracks: TrackCacheService,
  ) {}

  /** Returns playable video ids (cached 24 h). Needs YOUTUBE_API_KEY; otherwise []. */
  async refresh(url: string): Promise<string[]> {
    const parsed = parseYouTubePlaylist(url);
    if (!parsed) return [];
    const { playlistId } = parsed;
    const cached = await this.prisma.playlistCache.findUnique({
      where: { playlistId },
    });
    if (cached && Date.now() - cached.fetchedAt.getTime() < PLAYLIST_TTL_MS) {
      return cached.videoIds;
    }
    if (!this.youtube.searchEnabled) {
      this.logger.warn('Playlist dự phòng cần YOUTUBE_API_KEY — bỏ qua');
      return cached?.videoIds ?? [];
    }
    const ids = await this.youtube.playlistVideoIds(playlistId);
    if (ids.length === 0) return cached?.videoIds ?? [];
    const infos = await this.youtube
      .videos(ids)
      .catch(() => new Map<string, TrackInfo>());
    const playable: string[] = [];
    for (const id of ids) {
      const info = infos.get(id);
      if (!info || !info.embeddable || info.live) continue;
      await this.tracks.upsert(info);
      playable.push(id);
    }
    await this.prisma.playlistCache.upsert({
      where: { playlistId },
      create: { playlistId, videoIds: playable },
      update: { videoIds: playable, fetchedAt: new Date() },
    });
    return playable;
  }

  /**
   * A5: the playable songs of a playlist link, in playlist order. Uses the same 24 h
   * cache as the fallback playlist; reading a new playlist needs YOUTUBE_API_KEY.
   */
  async open(url: string): Promise<CommandResults['playlist:open']> {
    const parsed = parseYouTubePlaylist(url);
    if (!parsed) throw new AppError('LINK_UNSUPPORTED');
    const cached = await this.prisma.playlistCache.findUnique({
      where: { playlistId: parsed.playlistId },
    });
    if (!cached && !this.youtube.searchEnabled)
      throw new AppError('PLAYLIST_UNAVAILABLE');
    const ids = await this.refresh(url);
    const rows = await this.prisma.track.findMany({
      where: {
        id: { in: ids.map((v) => `youtube:${v}`) },
        embeddable: true,
        title: { not: '' },
      },
    });
    const byId = new Map(rows.map((t) => [t.externalId, t]));
    const tracks = ids.flatMap((v) => {
      const t = byId.get(v);
      return t ? [toTrackSummary(t)] : [];
    });
    if (!tracks.length) throw new AppError('PLAYLIST_EMPTY');
    return { playlistId: parsed.playlistId, tracks };
  }
}
