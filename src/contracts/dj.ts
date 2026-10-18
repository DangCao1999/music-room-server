import type { ErrorCode, ErrorParams } from './errors';
import type { TrackSummary } from './snapshot';

/**
 * "@DJ" in the room chat and "@Music Room" in Slack (spec 2026-10-18-dj-chat). The DJ answers
 * with this structure; each client words it in the viewer's language. AI never writes text
 * that is shown as is.
 */

/** Buttons "Chỉ cho tôi" can light up (`data-guide` on the client). */
export const GUIDE_TARGETS = [
  'skip',
  'save',
  'heart',
  'pause',
  'lyrics',
  'listen',
  'share',
  'mini',
  'add',
  'myItem',
  'block',
] as const;
export type GuideTarget = (typeof GUIDE_TARGETS)[number];

/** Questions the DJ answers from the room's state. */
export const INFO_KINDS = [
  'nowPlaying',
  'whoPicked',
  'myNext',
  'queueLength',
  'myCount',
] as const;
export type InfoKind = (typeof INFO_KINDS)[number];

export interface DjInfo {
  kind: InfoKind;
  /** nowPlaying / whoPicked: the song on air; null when nothing plays. */
  title?: string | null;
  pickedBy?: string | null;
  /** myNext: songs before the asker's next one, and when it should start (seconds from now). */
  ahead?: number;
  etaSec?: number | null;
  /** myNext: the asker's next song; absent = they have none waiting. */
  queueItemId?: string;
  /** queueLength / myCount. */
  count?: number;
  /** queueLength: total length in seconds; null when a song has no known length. */
  totalSec?: number | null;
}

export type DjReplyKind =
  | 'guide'
  | 'info'
  | 'added'
  | 'hello'
  | 'other'
  | 'busy'
  | 'denied'
  | 'error';

export interface DjReply {
  kind: DjReplyKind;
  /** Who asked: "bạn" for them, their name for everyone else. */
  forMemberId: string;
  forName: string;
  /** guide */
  guide?: GuideTarget;
  /** guide add: the song name to put in the search box. */
  query?: string;
  /** guide myItem / added: the queue item. */
  queueItemId?: string;
  info?: DjInfo;
  /** added: the song, its place in the queue (1 = next) and when it should start. */
  track?: TrackSummary;
  position?: number;
  etaSec?: number | null;
  /** added: a real "newest / trending" lookup succeeded; null = a plain search. */
  fresh?: 'latest' | 'popular' | null;
  /** denied / error / busy */
  errorCode?: ErrorCode;
  errorParams?: ErrorParams;
  retryAfterSec?: number;
}
