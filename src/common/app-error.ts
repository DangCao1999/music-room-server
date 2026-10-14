import type { ErrorCode, ErrorParams } from '../contracts';

/** Expected business error: turned into `{ ok: false, error }` acks, never logged as a crash. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params?: ErrorParams,
  ) {
    super(code);
    this.name = 'AppError';
  }
}
