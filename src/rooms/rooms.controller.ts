import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  normalizeRoomCode,
  ROOM_CODE_PATTERN,
  type RoomPreview,
} from '../contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public, read-only room card. The web app renders it into link previews (Open Graph
 * image with a QR code) so a shared link shows the room and the song on air.
 * Exposes nothing the room code does not already give access to.
 */
@Controller('rooms')
export class RoomsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':code/preview')
  async preview(
    @Param('code') raw: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RoomPreview> {
    const code = normalizeRoomCode(raw);
    if (!ROOM_CODE_PATTERN.test(code)) throw new NotFoundException();
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        playback: { select: { currentItemId: true, status: true } },
      },
    });
    if (!room) throw new NotFoundException();

    const currentId =
      room.playback?.status !== 'IDLE' ? room.playback?.currentItemId : null;
    const [item, memberCount] = await Promise.all([
      currentId
        ? this.prisma.queueItem.findUnique({
            where: { id: currentId },
            select: {
              track: {
                select: { title: true, channel: true, thumbnailUrl: true },
              },
              addedBy: { select: { displayName: true } },
            },
          })
        : null,
      this.prisma.member.count({
        where: {
          roomId: room.id,
          isDevice: false,
          leftAt: null,
          kickedAt: null,
        },
      }),
    ]);

    // Link-preview crawlers retry a lot; a short cache keeps them cheap.
    res.setHeader('Cache-Control', 'public, max-age=30');
    return {
      code: room.code,
      name: room.name,
      memberCount,
      nowPlaying: item
        ? {
            title: item.track.title,
            channel: item.track.channel,
            thumbnailUrl: item.track.thumbnailUrl,
            addedBy: item.addedBy?.displayName ?? null,
          }
        : null,
    };
  }
}
