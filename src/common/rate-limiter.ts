export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/** In-memory sliding-window limiter. Single api instance only (spec §4). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  hit(key: string, limit: number, windowMs: number, now: number): RateResult {
    if (this.hits.size > 10_000) this.sweep(now, windowMs);
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return {
        ok: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((recent[0] + windowMs - now) / 1000),
        ),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true };
  }

  /** Drop idle keys so the map does not grow forever. */
  sweep(now: number, maxWindowMs: number): void {
    for (const [key, list] of this.hits) {
      if (list.length === 0 || list[list.length - 1] <= now - maxWindowMs) {
        this.hits.delete(key);
      }
    }
  }
}
