import type {
  ActivityLogView,
  ChatMessageView,
  DjEvent,
  PlayerCommand,
  PlayerRevokeReason,
  ReactionEvent,
  RevokeReason,
  RoomSnapshot,
  TrackSummary,
} from './snapshot';

/** Ack payloads returned by commands that carry data. Others return {}. */
export interface CommandResults {
  'room:create': { token: string; code: string; memberId: string };
  'room:join': { token: string; code: string; memberId: string };
  'room:peek': { name: string; memberCount: number; onlineCount: number };
  'host:register': { token: string; code: string; memberId: string };
  'queue:add': { queueItemId: string; title: string };
  'search:query': { results: TrackSummary[] };
}

/** Server → client events. */
export interface ServerEvents {
  'session:ready': (data: { memberId: string; code: string }) => void;
  'session:revoked': (data: { reason: RevokeReason }) => void;
  'room:update': (snapshot: RoomSnapshot) => void;
  'chat:history': (messages: ChatMessageView[]) => void;
  'chat:receive': (message: ChatMessageView) => void;
  'activity:history': (logs: ActivityLogView[]) => void;
  'activity:new': (log: ActivityLogView) => void;
  'room:reaction': (event: ReactionEvent) => void;
  'dj:event': (event: DjEvent) => void;
  'player:command': (command: PlayerCommand) => void;
  'player:revoked': (data: { reason: PlayerRevokeReason }) => void;
}

export const ACK_TIMEOUT_MS = 8000;
export const PLAYER_PROGRESS_INTERVAL_MS = 5000;
export const PLAYER_LEASE_MS = 20000;
