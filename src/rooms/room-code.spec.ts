import { ROOM_CODE_PATTERN } from '../contracts';
import { generateRoomCode } from './room-code';

describe('generateRoomCode (R-02)', () => {
  it('TC-008 10k codes match the alphabet and length', () => {
    for (let i = 0; i < 10_000; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(ROOM_CODE_PATTERN);
      expect(c).not.toMatch(/[01IO]/);
    }
  });
  it('is spread (no more than a handful of duplicates in 10k)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateRoomCode());
    expect(seen.size).toBeGreaterThan(9_990);
  });
});
