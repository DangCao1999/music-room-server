import { parseIsoDuration } from './iso-duration';

describe('parseIsoDuration', () => {
  it.each([
    ['PT3M33S', 213],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['PT10M', 600],
    ['P1DT1S', 86401],
    ['P0D', 0],
  ])('%s → %d', (s, n) => expect(parseIsoDuration(s)).toBe(n));
  it.each(['', 'abc', '3:33', 'PT'])('%s → null', (s) =>
    expect(parseIsoDuration(s)).toBeNull(),
  );
});
