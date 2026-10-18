import { Injectable } from '@nestjs/common';
import { normalizeQuery } from '../contracts';
import type { Track } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Songs the room knows, offered to the AI so it can pick them (no YouTube quota). */
const KNOWN_HINT = 40;

/**
 * The room's song knowledge for the "@DJ" assistant (spec 2026-10-18-dj-chat; it replaced
 * "Hỏi DJ"): what the room has played, and the track behind an artist + song the AI named.
 */
@Injectable()
export class DjService {
  constructor(private readonly prisma: PrismaService) {}

  /** "artist - song" of up to 40 songs this room has queued before. */
  async knownTitles(roomId: string): Promise<string[]> {
    const known = await this.prisma.track.findMany({
      where: {
        artist: { not: null },
        song: { not: null },
        embeddable: true,
        title: { not: '' },
        queueItems: { some: { roomId } },
      },
      select: { artist: true, song: true },
      take: KNOWN_HINT,
    });
    return known.map((k) => `${k.artist} - ${k.song}`);
  }

  /** Exact artist + song first, then a title containing both (accents and case ignored). */
  async findKnown(artist: string, song: string): Promise<Track | null> {
    const a = normalizeQuery(artist);
    const s = normalizeQuery(song);
    const base = { embeddable: true, title: { not: '' } };
    return (
      (await this.prisma.track.findFirst({
        where: { ...base, artistKey: a, songKey: s },
      })) ??
      (await this.prisma.track.findFirst({
        where: {
          ...base,
          searchKey: { contains: s },
          AND: [{ searchKey: { contains: a } }],
        },
        orderBy: { fetchedAt: 'desc' },
      }))
    );
  }
}
