import { countVotes, requiredVotes } from './skip-votes';

describe('skip votes (R-25)', () => {
  it('TC-093 5 online @50% → 3', () => expect(requiredVotes(5, 0.5)).toBe(3));
  it('TC-094 4 online @50% → 2', () => expect(requiredVotes(4, 0.5)).toBe(2));
  it('TC-094 1 online → 1', () => expect(requiredVotes(1, 0.5)).toBe(1));
  it('0 voters → still 1 (admin must skip)', () =>
    expect(requiredVotes(0, 0.5)).toBe(1));
  it('TC-095 3 online @100% → 3', () => expect(requiredVotes(3, 1)).toBe(3));
  it('TC-097 3 online @50% → 2', () => expect(requiredVotes(3, 0.5)).toBe(2));
  it('float noise does not round up an exact product (10 @ 0.7 → 7)', () =>
    expect(requiredVotes(10, 0.7)).toBe(7));
  it('TC-096/097 counts each online voter once', () => {
    const online = new Set(['a', 'b', 'c']);
    expect(countVotes(['a', 'a', 'd', 'b'], online)).toEqual({
      votes: 2,
      voters: ['a', 'b'],
    });
  });
});
