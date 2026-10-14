import { signToken, TOKEN_TTL_SEC, verifyToken } from './token';

const SECRET = 'x'.repeat(32);

describe('token (R-06, TC-021)', () => {
  it('round-trips claims', () => {
    const t = signToken({ sub: 'm1', rid: 'r1', tv: 2 }, SECRET, 1000);
    expect(verifyToken(t, SECRET, 1001)).toMatchObject({
      sub: 'm1',
      rid: 'r1',
      tv: 2,
    });
  });
  it('rejects a tampered payload', () => {
    const t = signToken({ sub: 'm1', rid: 'r1', tv: 0 }, SECRET, 1000);
    const [h, , s] = t.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', rid: 'r1', tv: 0, iat: 1, exp: 9e9 }),
    ).toString('base64url');
    expect(verifyToken(`${h}.${forged}.${s}`, SECRET, 1001)).toBeNull();
  });
  it('rejects another secret', () => {
    const t = signToken({ sub: 'm1', rid: 'r1', tv: 0 }, SECRET, 1000);
    expect(verifyToken(t, 'y'.repeat(32), 1001)).toBeNull();
  });
  it('expires after 30 days', () => {
    const t = signToken({ sub: 'm1', rid: 'r1', tv: 0 }, SECRET, 1000);
    expect(verifyToken(t, SECRET, 1000 + TOKEN_TTL_SEC - 1)).not.toBeNull();
    expect(verifyToken(t, SECRET, 1000 + TOKEN_TTL_SEC)).toBeNull();
  });
  it.each([undefined, 42, '', 'a.b', 'a.b.c', 'x'.repeat(3000)])(
    'rejects junk %p',
    (j) => {
      expect(verifyToken(j, SECRET)).toBeNull();
    },
  );
});
