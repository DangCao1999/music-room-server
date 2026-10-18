import { Inject, Injectable } from '@nestjs/common';
import { GoogleVerifier } from '../auth/google';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import type { MyRoomView, RoomStatusView, UserView } from '../contracts';
import type { User } from '../generated/prisma/client';
import { LibraryService } from '../library/library.service';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';

/** L1 / L6: Google accounts — sign-in, the account behind a socket, "Phòng của tôi". */
@Injectable()
export class UsersService {
  private readonly google: GoogleVerifier | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly presence: PresenceService,
    private readonly library: LibraryService,
    @Inject(ENV) env: Env,
  ) {
    this.google = env.GOOGLE_CLIENT_ID
      ? new GoogleVerifier(env.GOOGLE_CLIENT_ID)
      : null;
  }

  view(u: User): UserView {
    return { id: u.id, name: u.name, email: u.email, picture: u.picture };
  }

  /** Google ID token → our account token. */
  async signIn(credential: string): Promise<{ token: string; user: User }> {
    if (!this.google) throw new AppError('SIGN_IN_UNAVAILABLE');
    const id = await this.google.verify(credential).catch(() => null);
    if (!id) throw new AppError('SIGN_IN_FAILED');
    const data = {
      email: id.email,
      name: id.name,
      picture: id.picture,
      lastSeenAt: new Date(),
    };
    const user = await this.prisma.user.upsert({
      where: { googleSub: id.sub },
      create: { googleSub: id.sub, ...data },
      update: data,
    });
    return { token: this.auth.signUser(user.id, user.tokenVersion), user };
  }

  /** The account of an account token, or null (bad, expired or revoked token). */
  async resolve(token: unknown): Promise<User | null> {
    const claims = this.auth.verifyUser(token);
    if (!claims) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    return user && user.tokenVersion === claims.tv ? user : null;
  }

  async byId(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  /** L6: rooms the user owns or has joined, most recently visited first (20 max). */
  async myRooms(userId: string): Promise<MyRoomView[]> {
    const rooms = await this.prisma.room.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      include: {
        members: { where: { userId }, select: { lastSeenAt: true } },
        playback: { select: { currentItemId: true } },
      },
      take: 50,
    });
    const playingIds = rooms
      .map((r) => r.playback?.currentItemId)
      .filter((x): x is string => Boolean(x));
    const playing = new Map(
      (
        await this.prisma.queueItem.findMany({
          where: { id: { in: playingIds } },
          select: { id: true, track: { select: { title: true } } },
        })
      ).map((q) => [q.id, q.track.title]),
    );
    return rooms
      .map((r) => {
        const seen = Math.max(
          r.createdAt.getTime(),
          ...r.members.map((m) => m.lastSeenAt.getTime()),
        );
        return {
          code: r.code,
          name: r.name,
          isOwner: r.ownerId === userId,
          onlineCount: this.presence.onlineMembers(r.id).size,
          nowPlaying:
            (r.playback?.currentItemId &&
              playing.get(r.playback.currentItemId)) ||
            null,
          lastVisitedAt: new Date(seen).toISOString(),
        };
      })
      .sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt))
      .slice(0, 20);
  }

  /** Rooms a device remembers (not signed in): rooms that no longer exist are left out. */
  async roomsStatus(codes: string[]): Promise<RoomStatusView[]> {
    const rooms = await this.prisma.room.findMany({
      where: { code: { in: [...new Set(codes)] } },
      include: { playback: { select: { currentItemId: true } } },
    });
    const playingIds = rooms
      .map((r) => r.playback?.currentItemId)
      .filter((x): x is string => Boolean(x));
    const playing = new Map(
      (
        await this.prisma.queueItem.findMany({
          where: { id: { in: playingIds } },
          select: { id: true, track: { select: { title: true } } },
        })
      ).map((q) => [q.id, q.track.title]),
    );
    return rooms.map((r) => ({
      code: r.code,
      name: r.name,
      onlineCount: this.presence.onlineMembers(r.id).size,
      nowPlaying:
        (r.playback?.currentItemId && playing.get(r.playback.currentItemId)) ||
        null,
    }));
  }

  /** L1: songs saved on a device before signing in join the account's favourites. */
  async importFavorites(userId: string, videoIds: string[]): Promise<number> {
    let imported = 0;
    for (let i = 0; i < videoIds.length; i += 50) {
      const { tracks } = await this.library.lookup(videoIds.slice(i, i + 50));
      if (!tracks.length) continue;
      const r = await this.prisma.userFavorite.createMany({
        data: tracks.map((t) => ({ userId, trackId: t.id })),
        skipDuplicates: true,
      });
      imported += r.count;
    }
    return imported;
  }
}
