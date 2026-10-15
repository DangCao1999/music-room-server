import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCb,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../common/app-error';
import { KeyedMutex } from '../common/keyed-mutex';
import { ENV, type Env } from '../config/env';
import { PinGuard } from './pin-guard';
import { type Claims, signToken, verifyToken } from './token';

const scrypt = (pin: string, salt: Buffer, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pin, salt, 32, opts, (e, key) => (e ? reject(e) : resolve(key))),
  );
/** N=2^15: ~50 ms per check, which on top of the lockout makes a 4-digit PIN slow to guess. */
const SCRYPT_OPTS: ScryptOptions = { N: 1 << 15, r: 8, p: 1, maxmem: 64 << 20 };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  readonly pinGuard = new PinGuard();
  private readonly pinMutex = new KeyedMutex();

  constructor(@Inject(ENV) private readonly env: Env) {
    this.secret = env.JWT_SECRET ?? this.loadOrCreateSecret();
  }

  /** JWT_SECRET from env, else a random one persisted to DATA_DIR/jwt-secret (spec §10). */
  private loadOrCreateSecret(): string {
    const file = join(this.env.DATA_DIR, 'jwt-secret');
    try {
      const existing = readFileSync(file, 'utf8').trim();
      if (existing.length >= 32) return existing;
    } catch {
      // first boot
    }
    const secret = randomBytes(48).toString('base64url');
    try {
      mkdirSync(this.env.DATA_DIR, { recursive: true });
      writeFileSync(file, secret, { mode: 0o600 });
      this.logger.log(`Generated JWT secret at ${file}`);
    } catch (e) {
      this.logger.warn(
        `Could not persist JWT secret (${(e as Error).message}); sessions reset on restart`,
      );
    }
    return secret;
  }

  sign(memberId: string, roomId: string, tokenVersion: number): string {
    return signToken(
      { sub: memberId, rid: roomId, tv: tokenVersion },
      this.secret,
    );
  }

  verify(token: unknown): Claims | null {
    return verifyToken(token, this.secret);
  }

  /** `scrypt$<salt>$<hash>` (base64url). */
  async hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(pin, salt, SCRYPT_OPTS);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  private async pinMatches(pinHash: string, pin: string): Promise<boolean> {
    const [kind, salt, hash] = pinHash.split('$');
    if (kind !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const key = await scrypt(pin, Buffer.from(salt, 'base64url'), SCRYPT_OPTS);
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  /**
   * PIN check with lockout per `guardKey` (ip|room). Throws PIN_NOT_SET / PIN_LOCKED /
   * PIN_INVALID. Attempts for one key run one at a time: otherwise many parallel guesses
   * would all pass the lockout check before the first failure is recorded.
   */
  checkPin(
    pinHash: string | null,
    pin: string,
    guardKey: string,
  ): Promise<void> {
    if (!pinHash) return Promise.reject(new AppError('PIN_NOT_SET'));
    return this.pinMutex.run(guardKey, async () => {
      const now = Date.now();
      const status = this.pinGuard.check(guardKey, now);
      if (status.locked)
        throw new AppError('PIN_LOCKED', { minutes: status.minutes });
      if (await this.pinMatches(pinHash, pin)) {
        this.pinGuard.reset(guardKey);
        return;
      }
      const after = this.pinGuard.fail(guardKey, now);
      if (after.locked)
        throw new AppError('PIN_LOCKED', { minutes: after.minutes });
      throw new AppError('PIN_INVALID', { remaining: after.remaining });
    });
  }
}
