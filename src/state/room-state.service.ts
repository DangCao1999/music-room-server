import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { KeyedMutex } from '../common/keyed-mutex';
import type { Member } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { Broadcaster } from '../realtime/broadcaster.service';
import { SnapshotService } from './snapshot.service';

export interface MutateCtx {
  /** Runs after the transaction committed and the snapshot was broadcast. */
  afterCommit(cb: () => void | Promise<void>): void;
  now: Date;
}

/** Identity of the socket issuing a command. Permissions are always re-read (TC-039). */
export interface Actor {
  memberId: string;
  roomId: string;
  socketId: string;
  ip: string;
}

/**
 * Single entry point for every room state change: one transaction, row lock on
 * PlaybackState (serialises concurrent commands → I-01, TC-066, TC-092),
 * version bump (R-49), snapshot broadcast after commit.
 */
@Injectable()
export class RoomStateService implements OnModuleDestroy {
  private readonly logger = new Logger(RoomStateService.name);
  private readonly mutex = new KeyedMutex();
  private closing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
    private readonly broadcaster: Broadcaster,
  ) {}

  private readonly committedListeners = new Set<(roomId: string) => void>();

  /** Called after every committed room change (e.g. the MC prepares intros). */
  onCommitted(listener: (roomId: string) => void): void {
    this.committedListeners.add(listener);
  }

  mutate<T>(
    roomId: string,
    fn: (tx: Tx, ctx: MutateCtx) => Promise<T>,
  ): Promise<T> {
    if (this.closing)
      return Promise.reject(new AppError('INTERNAL', { reason: 'shutdown' }));
    return this.mutex.run(roomId, () => this.mutateLocked(roomId, fn));
  }

  private async mutateLocked<T>(
    roomId: string,
    fn: (tx: Tx, ctx: MutateCtx) => Promise<T>,
  ): Promise<T> {
    const effects: Array<() => void | Promise<void>> = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ roomId: string }[]>`
          SELECT "roomId" FROM "PlaybackState" WHERE "roomId" = ${roomId} FOR UPDATE`;
        if (locked.length === 0) throw new AppError('ROOM_NOT_FOUND');
        const r = await fn(tx, {
          afterCommit: (cb) => effects.push(cb),
          now: new Date(),
        });
        await tx.playbackState.update({
          where: { roomId },
          data: { version: { increment: 1 } },
        });
        return r;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
    try {
      await this.broadcast(roomId);
    } catch (e) {
      // The change is committed: never skip timers / player commands / revokes.
      if (!this.closing) this.logger.error(`broadcast failed: ${String(e)}`);
    }
    for (const effect of effects) {
      try {
        await effect();
      } catch (e) {
        if (!this.closing)
          this.logger.error(`afterCommit effect failed: ${(e as Error).stack}`);
      }
    }
    for (const l of this.committedListeners) l(roomId);
    return result;
  }

  /** Runs before PrismaService disconnects (it depends on it), so late timers stop cleanly. */
  onModuleDestroy(): void {
    this.closing = true;
  }

  get isClosing(): boolean {
    return this.closing;
  }

  /** Version bump + broadcast without other changes (presence / lease changed). */
  touch(roomId: string): Promise<void> {
    if (this.closing) return Promise.resolve();
    return this.mutate(roomId, () => Promise.resolve(undefined)).catch(
      (e: unknown) => {
        if (!(e instanceof AppError) && !this.closing) {
          this.logger.error(`touch failed: ${String(e)}`);
        }
      },
    );
  }

  async broadcast(roomId: string): Promise<void> {
    const snap = await this.snapshots.build(roomId);
    if (snap) this.broadcaster.toRoom(roomId, 'room:update', snap);
  }

  /** Loads the actor's member row inside the transaction; gone/kicked/left → UNAUTHENTICATED. */
  async activeMember(tx: Tx, actor: Actor): Promise<Member> {
    const m = await tx.member.findUnique({ where: { id: actor.memberId } });
    if (!m || m.roomId !== actor.roomId || m.leftAt || m.kickedAt) {
      throw new AppError('UNAUTHENTICATED');
    }
    return m;
  }
}
