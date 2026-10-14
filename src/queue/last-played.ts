import type { Tx } from '../prisma/prisma.service';

type Reader = Pick<Tx, 'member'>;

/**
 * lastPlayedAt for every member who ever joined the room — including ones who left,
 * whose queued tracks stay (R-11). Snapshot and advance must use the same map so the
 * order shown is the order played (I-05, I-11).
 */
export async function lastPlayedMap(
  db: Reader,
  roomId: string,
): Promise<Map<string, number | null>> {
  const rows = await db.member.findMany({
    where: { roomId },
    select: { id: true, lastPlayedAt: true },
  });
  return new Map(rows.map((m) => [m.id, m.lastPlayedAt?.getTime() ?? null]));
}
