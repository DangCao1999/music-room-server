import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { AppError } from '../common/app-error';
import { RateLimiter } from '../common/rate-limiter';
import { ENV, type Env } from '../config/env';
import {
  type Ack,
  ANONYMOUS_COMMANDS,
  C2S,
  type CommandInput,
  type CommandName,
} from '../contracts';
import { MembersService, type Session } from '../members/members.service';
import { SearchService } from '../music/search.service';
import { PlaybackService } from '../playback/playback.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { ActivityService } from '../social/activity.service';
import { SocialService } from '../social/social.service';
import { type Actor, RoomStateService } from '../state/room-state.service';
import { SnapshotService } from '../state/snapshot.service';
import { Broadcaster, roomChannel } from './broadcaster.service';
import { PresenceService } from './presence.service';

interface Bound {
  memberId: string;
  roomId: string;
  code: string;
}

interface SocketData {
  ip: string;
  bound?: Bound;
  invalidToken?: boolean;
}

type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

/** R-43: account-creating commands per IP per minute (JOIN_LIMIT_PER_MINUTE, default 20). */
const IP_WINDOW_MS = 60_000;
/** Extra throttles (review): PIN guesses per member, room-code lookups per IP. */
export const CLAIM_LIMIT = { count: 10, windowMs: 60_000 };
export const PEEK_LIMIT = { count: 60, windowMs: 60_000 };

export function clientIp(socket: Socket, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  readonly ipLimiter = new RateLimiter();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly queue: QueueService,
    private readonly playback: PlaybackService,
    private readonly social: SocialService,
    private readonly search: SearchService,
    private readonly activity: ActivityService,
    private readonly state: RoomStateService,
    private readonly snapshots: SnapshotService,
    private readonly presence: PresenceService,
    private readonly broadcaster: Broadcaster,
  ) {}

  // ------------------------------------------------------------ lifecycle

  afterInit(server: Server): void {
    this.broadcaster.attach(server);
    server.use((socket, next) => {
      const s = socket as AppSocket;
      s.data.ip = clientIp(socket, this.env.TRUST_PROXY);
      const token = (socket.handshake.auth as { token?: unknown } | undefined)
        ?.token;
      if (!token) return next();
      this.members
        .resume(token)
        .then((r) => {
          if (r)
            s.data.bound = {
              memberId: r.member.id,
              roomId: r.member.roomId,
              code: r.code,
            };
          else s.data.invalidToken = true;
          next();
        })
        .catch((e: unknown) => {
          this.logger.error(`handshake failed: ${String(e)}`);
          next(new Error('INTERNAL'));
        });
    });
  }

  async handleConnection(socket: AppSocket): Promise<void> {
    if (socket.data.bound) {
      await this.bind(socket, socket.data.bound).catch((e: unknown) => {
        if (!this.state.isClosing)
          this.logger.error(`bind failed: ${String(e)}`);
      });
    } else if (socket.data.invalidToken) {
      socket.emit('session:revoked', { reason: 'invalid' });
    }
  }

  async handleDisconnect(socket: AppSocket): Promise<void> {
    await this.unbind(socket);
  }

  private async bind(socket: AppSocket, b: Bound): Promise<void> {
    socket.data.bound = b;
    await socket.join(roomChannel(b.roomId));
    const cameOnline = this.presence.add(b.memberId, b.roomId, socket.id);
    socket.emit('session:ready', { memberId: b.memberId, code: b.code });
    const [chat, logs] = await Promise.all([
      this.social.chatHistory(b.roomId),
      this.activity.history(b.roomId),
    ]);
    socket.emit('chat:history', chat);
    socket.emit('activity:history', logs);
    if (cameOnline) {
      // Presence changed: re-check vote thresholds (R-25) and broadcast to everyone.
      await this.state.mutate(b.roomId, (tx, ctx) =>
        this.playback.reevaluateSkip(tx, ctx, b.roomId),
      );
    } else {
      const snap = await this.snapshots.build(b.roomId);
      if (snap) socket.emit('room:update', snap);
    }
  }

  private async unbind(socket: AppSocket): Promise<void> {
    const b = socket.data.bound;
    socket.data.bound = undefined;
    if (!b) return;
    await socket.leave(roomChannel(b.roomId));
    const r = this.presence.remove(socket.id);
    if (r?.wentOffline && !this.state.isClosing) {
      await this.state
        .mutate(b.roomId, (tx, ctx) =>
          this.playback.reevaluateSkip(tx, ctx, b.roomId),
        )
        .catch((e: unknown) =>
          this.logger.warn(`presence update failed: ${String(e)}`),
        );
    }
  }

  // ------------------------------------------------------------ plumbing

  private actor(socket: AppSocket): Actor | null {
    const b = socket.data.bound;
    return b
      ? {
          memberId: b.memberId,
          roomId: b.roomId,
          socketId: socket.id,
          ip: socket.data.ip,
        }
      : null;
  }

  /** Validate (R-42), authenticate (R-09), run, and turn errors into acks. */
  private async run<K extends CommandName, R>(
    name: K,
    socket: AppSocket,
    body: unknown,
    handler: (input: CommandInput<K>, actor: Actor) => Promise<R>,
  ): Promise<Ack<R extends void ? Record<string, never> : R>> {
    try {
      const actor = this.actor(socket);
      if (!actor && !ANONYMOUS_COMMANDS.includes(name))
        throw new AppError('UNAUTHENTICATED');
      const parsed = C2S[name].safeParse(body ?? {});
      if (!parsed.success) throw new AppError('VALIDATION');
      const data = await handler(
        parsed.data as CommandInput<K>,
        actor as Actor,
      );
      return {
        ok: true,
        data: (data ?? {}) as R extends void ? Record<string, never> : R,
      };
    } catch (e) {
      if (e instanceof AppError) {
        return {
          ok: false,
          error: { code: e.code, ...(e.params ? { params: e.params } : {}) },
        };
      }
      this.logger.error(
        `${name} failed: ${e instanceof Error ? e.stack : String(e)}`,
      );
      return { ok: false, error: { code: 'INTERNAL' } };
    }
  }

  private limit(key: string, rule: { count: number; windowMs: number }): void {
    const r = this.ipLimiter.hit(key, rule.count, rule.windowMs, Date.now());
    if (!r.ok) throw new AppError('RATE_LIMITED', { seconds: r.retryAfterSec });
  }

  private limitIp(socket: AppSocket): void {
    const r = this.ipLimiter.hit(
      `ip:${socket.data.ip}`,
      this.env.JOIN_LIMIT_PER_MINUTE,
      IP_WINDOW_MS,
      Date.now(),
    );
    if (!r.ok) throw new AppError('RATE_LIMITED', { seconds: r.retryAfterSec });
  }

  private async enter(socket: AppSocket, session: Session) {
    await this.unbind(socket);
    await this.bind(socket, {
      memberId: session.memberId,
      roomId: session.roomId,
      code: session.code,
    });
    return {
      token: session.token,
      code: session.code,
      memberId: session.memberId,
    };
  }

  /** Loads the actor and rejects player devices (search is a member action — PM-16). */
  private async requireMember(actor: Actor): Promise<void> {
    const m = await this.prisma.member.findUnique({
      where: { id: actor.memberId },
    });
    if (!m || m.leftAt || m.kickedAt) throw new AppError('UNAUTHENTICATED');
    if (m.isDevice) throw new AppError('FORBIDDEN');
  }

  // ------------------------------------------------------------ rooms & identity

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:create', s, body, async (input) => {
      this.limitIp(s);
      return this.enter(s, await this.members.create(input));
    });
  }

  @SubscribeMessage('room:peek')
  peek(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:peek', s, body, (input) => {
      this.limit(`peek:${s.data.ip}`, PEEK_LIMIT);
      return this.members.peek(input.code);
    });
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:join', s, body, async (input) => {
      this.limitIp(s);
      return this.enter(s, await this.members.join(input));
    });
  }

  @SubscribeMessage('host:register')
  registerHost(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('host:register', s, body, async (input) => {
      this.limitIp(s);
      return this.enter(s, await this.members.registerHost(input));
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:leave', s, body, async (_i, actor) => {
      // Unbind this socket first so the ack still reaches it; other tabs get session:revoked.
      await this.unbind(s);
      await this.members.leave(actor);
    });
  }

  @SubscribeMessage('permission:set')
  setPermission(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('permission:set', s, body, (input, actor) =>
      this.members.setPermissions(actor, input),
    );
  }

  @SubscribeMessage('member:kick')
  kick(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('member:kick', s, body, (input, actor) =>
      this.members.kick(actor, input.memberId),
    );
  }

  @SubscribeMessage('room:settings')
  settings(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:settings', s, body, (input, actor) =>
      this.members.updateSettings(actor, input),
    );
  }

  // ------------------------------------------------------------ queue

  @SubscribeMessage('queue:add')
  add(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:add', s, body, (input, actor) =>
      this.queue.add(actor, input),
    );
  }

  @SubscribeMessage('queue:remove')
  remove(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:remove', s, body, (input, actor) =>
      this.queue.remove(actor, input.queueItemId),
    );
  }

  @SubscribeMessage('queue:pin-next')
  pin(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:pin-next', s, body, (input, actor) =>
      this.queue.pinNext(actor, input.queueItemId),
    );
  }

  @SubscribeMessage('queue:heart')
  heart(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:heart', s, body, (input, actor) =>
      this.queue.heart(actor, input.queueItemId),
    );
  }

  @SubscribeMessage('queue:set-message')
  setMessage(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:set-message', s, body, (input, actor) =>
      this.queue.setMessage(actor, input),
    );
  }

  @SubscribeMessage('queue:vote-skip')
  voteSkip(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('queue:vote-skip', s, body, (input, actor) =>
      this.playback.voteSkip(actor, input.queueItemId),
    );
  }

  @SubscribeMessage('search:query')
  searchQuery(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('search:query', s, body, async (input, actor) => {
      await this.requireMember(actor);
      return this.search.search(actor.memberId, input.q, input.remote);
    });
  }

  // ------------------------------------------------------------ playback

  @SubscribeMessage('playback:control')
  control(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('playback:control', s, body, (input, actor) =>
      this.playback.control(actor, input),
    );
  }

  @SubscribeMessage('player:claim')
  claimPlayer(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('player:claim', s, body, (_i, actor) =>
      this.playback.claimPlayer(actor),
    );
  }

  @SubscribeMessage('player:heartbeat')
  heartbeat(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('player:heartbeat', s, body, (_i, actor) =>
      this.playback.heartbeat(actor),
    );
  }

  @SubscribeMessage('player:report')
  report(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('player:report', s, body, (input, actor) =>
      this.playback.report(actor, input),
    );
  }

  // ------------------------------------------------------------ social

  @SubscribeMessage('chat:send')
  chat(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('chat:send', s, body, (input, actor) =>
      this.social.chat(actor, input.content),
    );
  }

  @SubscribeMessage('room:reaction')
  reaction(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('room:reaction', s, body, (input, actor) =>
      this.social.reaction(actor, input.emoji),
    );
  }

  @SubscribeMessage('dj:trigger')
  dj(@ConnectedSocket() s: AppSocket, @MessageBody() body: unknown) {
    return this.run('dj:trigger', s, body, (input, actor) =>
      this.social.dj(actor, input.soundType),
    );
  }
}
