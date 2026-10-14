import { LeaseService } from './lease.service';

describe('LeaseService (R-27, TC-123)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const make = () => {
    const s = new LeaseService({ leaseMs: 20_000, advanceGraceMs: 5000 });
    const changes: string[] = [];
    s.onChange = (r) => changes.push(r);
    return { s, changes };
  };

  it('holds for 19s, expires at 20s without renewals', () => {
    const { s, changes } = make();
    s.claim('r', 'm', 'sock');
    jest.advanceTimersByTime(19_000);
    expect(s.isOnline('r')).toBe(true);
    jest.advanceTimersByTime(1_001);
    expect(s.isOnline('r')).toBe(false);
    expect(changes).toEqual(['r', 'r']);
  });

  it('renewal by the holder extends; renewal by others is refused', () => {
    const { s } = make();
    s.claim('r', 'm', 'sock');
    jest.advanceTimersByTime(15_000);
    expect(s.renew('r', 'other')).toBe(false);
    expect(s.renew('r', 'sock')).toBe(true);
    jest.advanceTimersByTime(15_000);
    expect(s.isOnline('r')).toBe(true);
  });

  it('TC-122 a new socket replaces the holder and reports the old one', () => {
    const { s } = make();
    s.claim('r', 'a', 'sa');
    expect(s.claim('r', 'b', 'sb')).toEqual({ memberId: 'a', socketId: 'sa' });
    expect(s.holder('r')).toEqual({ memberId: 'b', socketId: 'sb' });
    expect(s.claim('r', 'b', 'sb')).toBeNull();
  });

  it('release only by matching member', () => {
    const { s } = make();
    s.claim('r', 'a', 'sa');
    expect(s.release('r', 'b')).toBeNull();
    expect(s.release('r', 'a')).toEqual({ memberId: 'a', socketId: 'sa' });
    expect(s.isOnline('r')).toBe(false);
  });
});
