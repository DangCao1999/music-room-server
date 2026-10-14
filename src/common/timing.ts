import { PLAYER_LEASE_MS } from '../contracts';

/** Durations that tests shrink to keep integration runs fast. */
export interface Timing {
  /** R-27: lease expires after this long without a player report. */
  leaseMs: number;
  /** R-30: server advances at duration + grace when the player stays silent. */
  advanceGraceMs: number;
}

export const DEFAULT_TIMING: Timing = {
  leaseMs: PLAYER_LEASE_MS,
  advanceGraceMs: 5000,
};
export const TIMING = Symbol('TIMING');
