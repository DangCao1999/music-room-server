import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../common/app-error';
import { KeyedMutex } from '../common/keyed-mutex';
import { ENV, type Env } from '../config/env';
import { PinGuard } from './pin-guard';
import { type Claims, signToken, verifyToken } from './token';

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

  hashPin(pin: string): Promise<string> {
    return hash(pin);
  }

  /**
   * PIN check with lockout per (ip, room) — R-08. Throws PIN_LOCKED / PIN_INVALID.
   * Attempts for one key run one at a time: otherwise hundreds of parallel guesses
   * would all pass check() before the first failure is recorded.
   */
  checkPin(pinHash: string, pin: string, guardKey: string): Promise<void> {
    return this.pinMutex.run(guardKey, () =>
      this.checkPinNow(pinHash, pin, guardKey),
    );
  }

  private async checkPinNow(
    pinHash: string,
    pin: string,
    guardKey: string,
  ): Promise<void> {
    const now = Date.now();
    const status = this.pinGuard.check(guardKey, now);
    if (status.locked)
      throw new AppError('PIN_LOCKED', { minutes: status.minutes });
    if (await verify(pinHash, pin)) {
      this.pinGuard.reset(guardKey);
      return;
    }
    const after = this.pinGuard.fail(guardKey, now);
    if (after.locked)
      throw new AppError('PIN_LOCKED', { minutes: after.minutes });
    throw new AppError('PIN_INVALID', { remaining: after.remaining });
  }

  /** R-01: constant-time comparison of the instance setup password. */
  checkSetupPassword(given: string | undefined): void {
    const expected = this.env.SETUP_PASSWORD;
    if (!expected) return;
    const a = createHash('sha256')
      .update(given ?? '')
      .digest();
    const b = createHash('sha256').update(expected).digest();
    if (!given || !timingSafeEqual(a, b)) {
      throw new AppError('SETUP_PASSWORD_INVALID');
    }
  }
}
