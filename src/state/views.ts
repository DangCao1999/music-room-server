import type {
  ActivityLogView,
  ActivityParams,
  ChatMessageView,
  QueueItemView,
  TrackSummary,
  VoicePreset,
} from '../contracts';
import type {
  ActivityLog,
  ChatMessage,
  Member,
  QueueItem,
  Track,
} from '../generated/prisma/client';

export type ItemWithRelations = QueueItem & {
  track: Track;
  addedBy: Pick<Member, 'id' | 'displayName'> | null;
  hearts: { memberId: string }[];
};

export const ITEM_INCLUDE = {
  track: true,
  addedBy: { select: { id: true, displayName: true } },
  hearts: { select: { memberId: true } },
} as const;

export function toTrackSummary(t: Track): TrackSummary {
  return {
    id: t.id,
    provider: 'youtube',
    externalId: t.externalId,
    title: t.title,
    channel: t.channel,
    durationSec: t.durationSec,
    thumbnailUrl: t.thumbnailUrl,
    artist: t.artist,
    song: t.song,
  };
}

export function toItemView(i: ItemWithRelations): QueueItemView {
  return {
    id: i.id,
    track: toTrackSummary(i.track),
    addedBy: i.addedBy
      ? { id: i.addedBy.id, displayName: i.addedBy.displayName }
      : null,
    hearts: i.hearts.length,
    heartedBy: i.hearts.map((h) => h.memberId),
    pinned: i.pinnedAt !== null,
    wishMessage: i.wishMessage,
    voicePreset: (i.voicePreset as VoicePreset | null) ?? null,
    addedAt: i.addedAt.toISOString(),
    // Older automatic items predate the column: no member means the fallback playlist.
    auto:
      i.auto === 'radio' || i.auto === 'fallback'
        ? i.auto
        : i.addedById === null
          ? 'fallback'
          : null,
  };
}

export function toChatView(m: ChatMessage): ChatMessageView {
  return {
    id: m.id,
    memberId: m.memberId,
    displayName: m.displayName,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

const PARAM_KEYS = [
  'variant',
  'title',
  'target',
  'targetDevice',
  'count',
  'yes',
  'no',
  'code',
  'actorDevice',
] as const satisfies readonly (keyof ActivityParams)[];

/** Lines written since params exist carry `{ v: 1, ... }`; older ones have none (null). */
function logParams(metadata: unknown): ActivityParams | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (m.v !== 1) return null;
  const out: Record<string, unknown> = {};
  for (const k of PARAM_KEYS) if (m[k] !== undefined) out[k] = m[k];
  return out as ActivityParams;
}

export function toLogView(l: ActivityLog): ActivityLogView {
  return {
    id: l.id,
    type: l.type,
    memberId: l.memberId,
    displayName: l.displayName,
    message: l.message,
    params: logParams(l.metadata),
    createdAt: l.createdAt.toISOString(),
  };
}

/** Position (s) at `now` for a state measured at positionAt. */
export function estimatePosition(
  ps: { status: string; positionSec: number; positionAt: Date },
  now: number,
): number {
  if (ps.status !== 'PLAYING') return ps.positionSec;
  return ps.positionSec + Math.max(0, now - ps.positionAt.getTime()) / 1000;
}
