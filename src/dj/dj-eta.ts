import type { RoomSnapshot } from '../contracts';

/**
 * When the queue item at `index` should start, in seconds from now: what is left of the song
 * on air plus the songs before it (like the station theme's board); null from the first song
 * of unknown length on.
 */
export function etaSec(snap: RoomSnapshot, index: number): number | null {
  const np = snap.nowPlaying;
  let at = 0;
  if (np) {
    const dur = np.item.track.durationSec;
    if (!dur) return null;
    const played =
      np.positionSec +
      (np.status === 'PLAYING' ? (Date.now() - np.positionAt) / 1000 : 0);
    at += Math.max(0, dur - played);
  }
  for (const q of snap.queue.slice(0, index)) {
    if (!q.track.durationSec) return null;
    at += q.track.durationSec;
  }
  return Math.round(at);
}
