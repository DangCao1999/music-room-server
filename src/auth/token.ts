import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal HS256 JWT (header.payload.signature) on node:crypto. We only ever
// verify tokens we signed ourselves, so the header is fixed and checked exactly.

export interface Claims {
  sub: string; // memberId
  rid: string; // roomId
  tv: number; // tokenVersion
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
).toString('base64url');
export const TOKEN_TTL_SEC = 30 * 24 * 3600;

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signToken(
  claims: Pick<Claims, 'sub' | 'rid' | 'tv'>,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, iat: nowSec, exp: nowSec + TOKEN_TTL_SEC }),
  ).toString('base64url');
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`, secret)}`;
}

export function verifyToken(
  token: unknown,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Claims | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const c = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString(),
    ) as Claims;
    if (
      typeof c.sub !== 'string' ||
      typeof c.rid !== 'string' ||
      typeof c.tv !== 'number' ||
      typeof c.exp !== 'number' ||
      c.exp <= nowSec
    ) {
      return null;
    }
    return c;
  } catch {
    return null;
  }
}
