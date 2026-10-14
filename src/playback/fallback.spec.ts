import { pickFallback } from './fallback';

describe('pickFallback (R-31)', () => {
  const ids = Array.from({ length: 25 }, (_, i) => `v${i}`);
  it('TC-105 never picks one of the 20 most recent', () => {
    const recent = ids.slice(0, 20);
    for (let r = 0; r < 50; r++) {
      const pick = pickFallback(ids, recent, () => r / 50);
      expect(pick).not.toBeNull();
      expect(recent).not.toContain(pick);
    }
  });
  it('falls back to any item when everything was played recently', () => {
    expect(pickFallback(['a', 'b'], ['a', 'b'], () => 0.99)).toBe('b');
  });
  it('TC-107 empty playlist → null', () => {
    expect(pickFallback([], [], () => 0)).toBeNull();
  });
});
