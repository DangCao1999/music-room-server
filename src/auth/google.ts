import {
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
  verify,
} from 'node:crypto';

/**
 * L1: verifies a Google ID token (RS256 JWT from Google Identity Services) with
 * node:crypto only. Keys come from Google's JWKS and are cached as long as Google's
 * Cache-Control allows (refetched once when an unknown key id shows up).
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const SKEW_SEC = 60;

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

export class GoogleVerifier {
  private keys = new Map<string, KeyObject>();
  private expiresAt = 0;
  private fetchedAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly fetchJwks: () => Promise<{
      keys: Jwk[];
      maxAgeSec: number;
    }> = defaultFetch,
  ) {}

  private async key(kid: string): Promise<KeyObject | null> {
    const fresh = Date.now() < this.expiresAt;
    if (fresh && this.keys.has(kid)) return this.keys.get(kid)!;
    // An unknown key id refetches at most once a minute (made-up ids must not hammer Google).
    if (fresh && Date.now() - this.fetchedAt < 60_000) return null;
    this.fetchedAt = Date.now();
    const { keys, maxAgeSec } = await this.fetchJwks();
    this.keys = new Map(
      keys
        .filter((k) => k.kid && k.kty === 'RSA')
        .map((k) => [k.kid!, createPublicKey({ key: k, format: 'jwk' })]),
    );
    this.expiresAt = Date.now() + Math.max(60, maxAgeSec) * 1000;
    return this.keys.get(kid) ?? null;
  }

  /** The identity in `token`, or null when anything about it is wrong. */
  async verify(
    token: string,
    nowSec = Math.floor(Date.now() / 1000),
  ): Promise<GoogleIdentity | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString(),
      ) as typeof header;
      claims = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString(),
      ) as typeof claims;
    } catch {
      return null;
    }
    if (header.alg !== 'RS256' || !header.kid) return null;
    const key = await this.key(header.kid);
    if (!key) return null;
    const ok = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], 'base64url'),
    );
    if (!ok) return null;
    const {
      iss,
      aud,
      exp,
      iat,
      sub,
      email,
      email_verified: verified,
      name,
      picture,
    } = claims;
    if (typeof iss !== 'string' || !ISSUERS.includes(iss)) return null;
    if (aud !== this.clientId) return null;
    if (typeof exp !== 'number' || exp + SKEW_SEC < nowSec) return null;
    if (typeof iat === 'number' && iat - SKEW_SEC > nowSec) return null;
    if (
      typeof sub !== 'string' ||
      !sub ||
      typeof email !== 'string' ||
      verified !== true
    )
      return null;
    return {
      sub,
      email,
      name:
        typeof name === 'string' && name.trim()
          ? name.trim().slice(0, 60)
          : email.split('@')[0],
      picture:
        typeof picture === 'string' && picture.startsWith('https://')
          ? picture
          : null,
    };
  }
}

async function defaultFetch(): Promise<{ keys: Jwk[]; maxAgeSec: number }> {
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Google JWKS HTTP ${res.status}`);
  const maxAge = /max-age=(\d+)/.exec(
    res.headers.get('cache-control') ?? '',
  )?.[1];
  return {
    keys: ((await res.json()) as { keys: Jwk[] }).keys,
    maxAgeSec: Number(maxAge ?? 3600),
  };
}
