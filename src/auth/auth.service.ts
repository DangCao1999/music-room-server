import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV, type Env } from '../config/env';
import { type Claims, signToken, verifyToken } from './token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

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
}
