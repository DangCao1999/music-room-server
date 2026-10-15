import type { DjSound, Reaction, VoicePreset } from './constants';
import type { RoomSettings } from './schemas';

export type Role = 'ADMIN' | 'USER';
export type PlaybackStatus = 'IDLE' | 'PLAYING' | 'PAUSED';

export interface TrackSummary {
  id: string; // "youtube:<videoId>"
  provider: 'youtube';
  externalId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  /** AI1: parsed from the title; null until known. */
  artist: string | null;
  song: string | null;
}

/** A7: `synced` lines carry their start time in seconds; `plain` is the text alone. */
export interface LyricsView {
  synced: { t: number; text: string }[] | null;
  plain: string | null;
}

/** Why a song is suggested (A3). */
export type SuggestionReason = 'similar' | 'room' | 'artist' | 'popular' | 'dj';

/**
 * `track`: a song the server knows, added in one tap. `search`: a song Last.fm suggests
 * that has no YouTube video here yet ("Tìm & thêm" runs a normal search).
 */
export type SuggestionView =
  | { kind: 'track'; track: TrackSummary; reason: SuggestionReason }
  | { kind: 'search'; artist: string; song: string; reason: 'similar' | 'dj' };

/** A8: what a room played over a period. */
export interface RecapView {
  plays: number;
  minutes: number;
  skipped: number;
  topSongs: { track: TrackSummary; plays: number; hearts: number }[];
  topPickers: {
    member: { id: string; displayName: string };
    songs: number;
    hearts: number;
  }[];
  /** Songs started in each local hour, index 0–23. */
  byHour: number[];
  /** A one-line, light-hearted comment written by AI (null without AI). */
  summary: string | null;
}

export interface MemberView {
  id: string;
  displayName: string;
  color: string;
  role: Role;
  isDevice: boolean;
  canPlay: boolean;
  canControl: boolean;
  canDj: boolean;
  online: boolean;
}

/** A1: one song this room has played (PLAYED or SKIPPED), all its plays together. */
export interface LibraryItemView {
  track: TrackSummary;
  plays: number;
  /** Hearts over every play. */
  hearts: number;
  lastPlayedAt: string;
  /** Who added it last time; null = fallback playlist. */
  lastAddedBy: { id: string; displayName: string } | null;
}

export interface QueueItemView {
  id: string;
  track: TrackSummary;
  /** null = fallback playlist ("Playlist dự phòng"). */
  addedBy: { id: string; displayName: string } | null;
  /** Set when the room added it itself (addedBy is null): radio (A4) or fallback playlist. */
  auto: 'radio' | 'fallback' | null;
  /** 1-based fair-queue round (0 for pinned / now playing). */
  round: number;
  hearts: number;
  heartedBy: string[];
  pinned: boolean;
  wishMessage: string | null;
  voicePreset: VoicePreset | null;
  addedAt: string;
}

export interface NowPlayingView {
  item: QueueItemView;
  status: Exclude<PlaybackStatus, 'IDLE'>;
  /** Position at `positionAt` (server epoch ms). Clients extrapolate while PLAYING. */
  positionSec: number;
  positionAt: number;
  skip: { votes: number; required: number; voters: string[] };
}

export interface RoomSnapshot {
  version: number;
  serverTime: number;
  /** `hasPin`: an admin PIN is set, so members can reclaim admin with it. */
  room: {
    code: string;
    name: string;
    settings: RoomSettings;
    hasPin: boolean;
  };
  members: MemberView[];
  /** Upcoming items, already in play order (R-18). */
  queue: QueueItemView[];
  status: PlaybackStatus;
  nowPlaying: NowPlayingView | null;
  player: { memberId: string | null; online: boolean };
  searchEnabled: boolean;
  /** A free AI provider is configured (DJ, MC, smarter radio, recap comment). */
  aiEnabled: boolean;
}

export interface ChatMessageView {
  id: string;
  memberId: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface ActivityLogView {
  id: string;
  type: string;
  memberId: string | null;
  displayName: string | null;
  message: string;
  createdAt: string;
}

export interface PlayerCommand {
  queueItemId: string | null;
  videoId: string | null;
  status: PlaybackStatus;
  positionSec: number;
  positionAt: number;
  wish: { message: string; voicePreset: VoicePreset | null } | null;
  /** AI3: the MC's line for this song, read when there is no wish. */
  intro: string | null;
}

export type RevokeReason = 'kicked' | 'left' | 'invalid';
export type PlayerRevokeReason = 'replaced' | 'permission' | 'kicked';

export interface ReactionEvent {
  emoji: Reaction;
  memberId: string;
}

export interface DjEvent {
  soundType: DjSound;
  memberId: string;
  displayName: string;
}

/** GET /api/rooms/:code/preview — public card for link previews and the share dialog. */
export interface RoomPreview {
  code: string;
  name: string;
  memberCount: number;
  nowPlaying: {
    title: string;
    channel: string | null;
    thumbnailUrl: string | null;
    addedBy: string | null;
  } | null;
}
