import { hash } from '@node-rs/argon2';
import { AppError } from '../common/app-error';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';

describe('AuthService.checkPin under parallel guessing (review P1-1, R-08)', () => {
  it('20 simultaneous wrong guesses: 4 × PIN_INVALID then locked; the right PIN stays locked', async () => {
    const auth = new AuthService({
      JWT_SECRET: 'x'.repeat(32),
      DATA_DIR: '/tmp',
    } as Env);
    const pinHash = await hash('1234');
    const codes = await Promise.all(
      Array.from({ length: 20 }, () =>
        auth.checkPin(pinHash, '0000', 'ip|room').then(
          () => 'OK',
          (e: unknown) => (e as AppError).code,
        ),
      ),
    );
    expect(codes.filter((c) => c === 'PIN_INVALID')).toHaveLength(4);
    expect(codes.filter((c) => c === 'PIN_LOCKED')).toHaveLength(16);
    const right = await auth
      .checkPin(pinHash, '1234', 'ip|room')
      .catch((e: unknown) => e);
    expect((right as AppError).code).toBe('PIN_LOCKED');
  });
});
