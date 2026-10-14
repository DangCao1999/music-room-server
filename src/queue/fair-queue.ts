// Fair round-robin queue ordering (R-18, spec §8.1). Pure: the order is
// recomputed on every read and never stored.

export interface FairItem {
  id: string;
  addedById: string | null;
  /** epoch ms */
  addedAt: number;
  /** epoch ms, null when not pinned */
  pinnedAt: number | null;
  hearts: number;
}

export type Ordered<T extends FairItem> = T & {
  /** 1-based round; 0 for pinned items. */
  round: number;
};

const SYSTEM = '\u0000system';

function byAddedThenId(a: FairItem, b: FairItem): number {
  return a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * 1. Pinned items first, by pin time.
 * 2. Remaining items: the i-th unpinned item of each member is in round i.
 * 3. Inside a round: more hearts first, then the member who least recently had
 *    a track played (never played first), then addedAt, then id.
 */
export function orderQueue<T extends FairItem>(
  items: readonly T[],
  lastPlayedAt: ReadonlyMap<string, number | null>,
): Ordered<T>[] {
  const pinned = items
    .filter((i) => i.pinnedAt !== null)
    .sort((a, b) => a.pinnedAt! - b.pinnedAt! || byAddedThenId(a, b))
    .map((i) => ({ ...i, round: 0 }));

  const perMember = new Map<string, T[]>();
  for (const i of items) {
    if (i.pinnedAt !== null) continue;
    const key = i.addedById ?? SYSTEM;
    const list = perMember.get(key) ?? [];
    list.push(i);
    perMember.set(key, list);
  }

  const ranked: Ordered<T>[] = [];
  for (const list of perMember.values()) {
    list.sort(byAddedThenId);
    list.forEach((i, idx) => ranked.push({ ...i, round: idx + 1 }));
  }

  const played = (i: FairItem) =>
    i.addedById === null ? null : (lastPlayedAt.get(i.addedById) ?? null);

  ranked.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.hearts !== b.hearts) return b.hearts - a.hearts;
    const pa = played(a);
    const pb = played(b);
    if (pa !== pb) {
      if (pa === null) return -1;
      if (pb === null) return 1;
      return pa - pb;
    }
    return byAddedThenId(a, b);
  });

  return [...pinned, ...ranked];
}
