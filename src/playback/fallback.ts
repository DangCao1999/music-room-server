// Fallback playlist pick (R-31). Pure.

/** Random item not among `recent`; if everything is recent, any item; null for an empty playlist. */
export function pickFallback(
  ids: readonly string[],
  recent: readonly string[],
  rnd: () => number = Math.random,
): string | null {
  const recentSet = new Set(recent);
  const fresh = ids.filter((id) => !recentSet.has(id));
  const pool = fresh.length > 0 ? fresh : ids;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}
