// Queue ordering (spec §8.1). Pure: the order is recomputed on every read and
// never stored.

export interface FairItem {
  id: string;
  /** epoch ms */
  addedAt: number;
  /** epoch ms, null when not pinned */
  pinnedAt: number | null;
  hearts: number;
}

function byAddedThenId(a: FairItem, b: FairItem): number {
  return a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * 1. Pinned items first, by pin time.
 * 2. Remaining items: more hearts first; same hearts → added first plays first,
 *    then id so the order is always deterministic.
 */
export function orderQueue<T extends FairItem>(items: readonly T[]): T[] {
  const pinned = items
    .filter((i) => i.pinnedAt !== null)
    .sort((a, b) => a.pinnedAt! - b.pinnedAt! || byAddedThenId(a, b));
  const rest = items
    .filter((i) => i.pinnedAt === null)
    .sort((a, b) => b.hearts - a.hearts || byAddedThenId(a, b));
  return [...pinned, ...rest];
}
