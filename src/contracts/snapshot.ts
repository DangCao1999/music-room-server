import type { DjSound, Reaction, RoomSettings, VoicePreset } from './schemas';

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

export interface QueueItemView {
  id: string;
  track: TrackSummary;
  /** null = fallback playlist ("Playlist dự phòng"). */
  addedBy: { id: string; displayName: string } | null;
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
  room: { code: string; name: string; settings: RoomSettings };
  members: MemberView[];
  /** Upcoming items, already in play order (R-18). */
  queue: QueueItemView[];
  status: PlaybackStatus;
  nowPlaying: NowPlayingView | null;
  player: { memberId: string | null; online: boolean };
  searchEnabled: boolean;
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
