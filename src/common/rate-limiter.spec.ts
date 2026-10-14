import { RateLimiter } from './rate-limiter';

describe('RateLimiter (sliding window)', () => {
  it('TC-010 allows 20 per minute, blocks the 21st with retryAfter', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 20; i++)
      expect(rl.hit('ip', 20, 60_000, 1000 + i).ok).toBe(true);
    const r = rl.hit('ip', 20, 60_000, 2000);
    expect(r).toEqual({ ok: false, retryAfterSec: 59 });
  });
  it('frees capacity once the window slides', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5; i++) rl.hit('k', 5, 10_000, 0);
    expect(rl.hit('k', 5, 10_000, 9_999).ok).toBe(false);
    expect(rl.hit('k', 5, 10_000, 10_000).ok).toBe(true);
  });
  it('keys are independent', () => {
    const rl = new RateLimiter();
    expect(rl.hit('a', 1, 1000, 0).ok).toBe(true);
    expect(rl.hit('b', 1, 1000, 0).ok).toBe(true);
    expect(rl.hit('a', 1, 1000, 1).ok).toBe(false);
  });
  it('rejected hits do not extend the window', () => {
    const rl = new RateLimiter();
    rl.hit('k', 1, 1000, 0);
    rl.hit('k', 1, 1000, 500);
    expect(rl.hit('k', 1, 1000, 1000).ok).toBe(true);
  });
});
