import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import type { CommandResults, YouTubePlaylistView } from '../contracts';
import { MAX_PLAYLIST_TRACKS } from '../contracts';
import { PlaylistsService } from '../playlists/playlists.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackCacheService, trackId } from './track-cache.service';
import { type VideoItem, videoToTrackInfo } from './youtube.provider';

const API = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 8000;
const MUSIC_CATEGORY = '10';
const LIKED_NAME = 'Đã thích trên YouTube';

type Fetch = typeof fetch;

/**
 * L3: reads the signed-in user's own YouTube data with the short-lived access token
 * their browser just got (scope youtube.readonly). The token is used for this request
 * only — never stored. Quota goes to the OAuth client's Google Cloud project.
 */
@Injectable()
export class YouTubeAccountService {
  private readonly logger = new Logger(YouTubeAccountService.name);
  /** Swappable for probes. */
  fetchImpl: Fetch = (input, init) => fetch(input, init);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracks: TrackCacheService,
    private readonly playlists: PlaylistsService,
  ) {}

  private async get<T>(
    token: string,
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const res = await this.fetchImpl(
      `${API}/${path}?${new URLSearchParams(params).toString()}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      error?: { errors?: { reason?: string }[]; message?: string };
    } | null;
    if (res.ok) return body as T;
    const reason = body?.error?.errors?.[0]?.reason ?? `http${res.status}`;
    if (
      ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(
        reason,
      )
    )
      throw new AppError('QUOTA_EXCEEDED');
    if (res.status === 401 || res.status === 403)
      throw new AppError('YOUTUBE_ACCESS_DENIED', { reason });
    this.logger.warn(`YouTube ${path} failed: ${res.status} ${reason}`);
    throw new AppError('INTERNAL', { status: res.status });
  }

  /** Pages through a list endpoint until `limit` items or the end. */
  private async collect<T>(
    token: string,
    path: string,
    params: Record<string, string>,
    limit: number,
  ): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items?: T[]; nextPageToken?: string }>(
        token,
        path,
        {
          ...params,
          maxResults: '50',
          ...(pageToken ? { pageToken } : {}),
        },
      );
      out.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken && out.length < limit);
    return out.slice(0, limit);
  }

  async library(
    userId: string,
    token: string,
  ): Promise<CommandResults['youtube:library']> {
    const items = await this.collect<{
      id: string;
      snippet?: {
        title?: string;
        thumbnails?: Record<string, { url?: string } | undefined>;
      };
      contentDetails?: { itemCount?: number };
    }>(
      token,
      'playlists',
      { part: 'snippet,contentDetails', mine: 'true' },
      200,
    );
    const imported = new Map(
      (
        await this.prisma.playlist.findMany({
          where: { ownerId: userId, source: { startsWith: 'yt:' } },
          select: { id: true, source: true },
        })
      ).map((p) => [p.source, p.id]),
    );
    const playlists: YouTubePlaylistView[] = items.map((p) => ({
      id: p.id,
      title: p.snippet?.title ?? p.id,
      itemCount: p.contentDetails?.itemCount ?? 0,
      thumbnailUrl:
        p.snippet?.thumbnails?.medium?.url ??
        p.snippet?.thumbnails?.default?.url ??
        null,
      importedId: imported.get(`yt:${p.id}`) ?? null,
    }));
    return { playlists, likedImportedId: imported.get('yt:liked') ?? null };
  }

  async import(
    userId: string,
    token: string,
    source: string,
    musicOnly: boolean,
  ): Promise<CommandResults['youtube:import']> {
    let videos: VideoItem[];
    let name: string;
    const part = 'snippet,contentDetails,status';
    if (source === 'liked') {
      videos = await this.collect<VideoItem>(
        token,
        'videos',
        { part, myRating: 'like' },
        MAX_PLAYLIST_TRACKS,
      );
      name = LIKED_NAME;
    } else {
      const meta = await this.get<{
        items?: { snippet?: { title?: string } }[];
      }>(token, 'playlists', {
        part: 'snippet',
        id: source,
      });
      name = (meta.items?.[0]?.snippet?.title ?? 'Playlist YouTube').slice(
        0,
        60,
      );
      const entries = await this.collect<{
        contentDetails?: { videoId?: string };
      }>(
        token,
        'playlistItems',
        { part: 'contentDetails', playlistId: source },
        MAX_PLAYLIST_TRACKS,
      );
      const ids = entries
        .map((e) => e.contentDetails?.videoId)
        .filter((v): v is string => Boolean(v));
      videos = [];
      for (let i = 0; i < ids.length; i += 50) {
        const page = await this.get<{ items?: VideoItem[] }>(token, 'videos', {
          part,
          id: ids.slice(i, i + 50).join(','),
        });
        const byId = new Map((page.items ?? []).map((v) => [v.id, v]));
        // Keep the playlist's own order (videos.list does not promise it).
        for (const id of ids.slice(i, i + 50)) {
          const v = byId.get(id);
          if (v) videos.push(v);
        }
      }
    }
    const keep = videos.filter((v) => {
      const info = videoToTrackInfo(v);
      return (
        info.embeddable &&
        !info.live &&
        (!musicOnly || v.snippet?.categoryId === MUSIC_CATEGORY)
      );
    });
    for (const v of keep) await this.tracks.upsert(videoToTrackInfo(v));
    const playlistId = await this.playlists.saveFromSource(
      userId,
      `yt:${source}`,
      name,
      keep.map((v) => trackId(v.id)),
    );
    return {
      playlistId,
      name,
      imported: keep.length,
      skipped: videos.length - keep.length,
    };
  }
}
