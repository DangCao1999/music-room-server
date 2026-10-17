import { Injectable } from '@nestjs/common';
import type { ActivityParams } from '../contracts';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { Broadcaster } from '../realtime/broadcaster.service';
import type { MutateCtx } from '../state/room-state.service';
import { toLogView } from '../state/views';

export const KEEP_LOGS = 200;
export const KEEP_CHAT = 200;

/** Activity log (R-41): written inside the caller's transaction, pushed after commit. */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcaster: Broadcaster,
  ) {}

  async log(
    tx: Tx,
    ctx: MutateCtx,
    roomId: string,
    actor: { id: string; displayName: string; isDevice?: boolean } | null,
    type: string,
    /** The Vietnamese sentence (kept for older clients and Slack). */
    message: string,
    /** What the line is about, so each reader can word it in their language. */
    params: ActivityParams = {},
  ): Promise<void> {
    const metadata = {
      v: 1,
      ...params,
      ...(actor?.isDevice ? { actorDevice: true } : {}),
    };
    const row = await tx.activityLog.create({
      data: {
        roomId,
        memberId: actor?.id ?? null,
        displayName: actor?.displayName ?? null,
        type,
        message,
        metadata,
      },
    });
    ctx.afterCommit(async () => {
      this.broadcaster.toRoom(roomId, 'activity:new', toLogView(row));
      await this.trim(roomId);
    });
  }

  async history(roomId: string) {
    const rows = await this.prisma.activityLog.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: KEEP_LOGS,
    });
    return rows.map(toLogView);
  }

  private async trim(roomId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "ActivityLog" WHERE "id" IN (
        SELECT "id" FROM "ActivityLog" WHERE "roomId" = ${roomId}
        ORDER BY "createdAt" DESC OFFSET ${KEEP_LOGS})`;
  }
}
