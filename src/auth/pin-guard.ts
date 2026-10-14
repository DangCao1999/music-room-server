// Wrong-PIN lockout (R-08): 5 failures within 15 minutes → locked for 15 minutes.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

export type PinStatus =
  | { locked: false; remaining: number }
  | { locked: true; minutes: number };

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export class PinGuard {
  private readonly entries = new Map<string, Entry>();

  private entry(key: string, now: number): Entry {
    const e = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    e.failures = e.failures.filter((t) => t > now - WINDOW_MS);
    this.entries.set(key, e);
    return e;
  }

  check(key: string, now: number): PinStatus {
    const e = this.entry(key, now);
    if (e.lockedUntil > now) {
      return {
        locked: true,
        minutes: Math.ceil((e.lockedUntil - now) / 60_000),
      };
    }
    return { locked: false, remaining: MAX_FAILURES - e.failures.length };
  }

  fail(key: string, now: number): PinStatus {
    const e = this.entry(key, now);
    if (e.lockedUntil > now) return this.check(key, now);
    e.failures.push(now);
    if (e.failures.length >= MAX_FAILURES) {
      e.failures = [];
      e.lockedUntil = now + LOCK_MS;
      return { locked: true, minutes: LOCK_MS / 60_000 };
    }
    return { locked: false, remaining: MAX_FAILURES - e.failures.length };
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}
