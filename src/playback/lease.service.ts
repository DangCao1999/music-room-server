import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { TIMING, type Timing } from '../common/timing';

interface Lease {
  memberId: string;
  socketId: string;
  timer: NodeJS.Timeout;
}

/**
 * One player lease per room (R-27, I-07). Kept in memory: after a restart the
 * player simply claims again when its socket reconnects.
 */
@Injectable()
export class LeaseService implements OnModuleDestroy {
  private readonly leases = new Map<string, Lease>();
  /** Called when a lease appears or disappears (wired to a snapshot broadcast). */
  onChange: (roomId: string) => void = () => {};

  constructor(@Inject(TIMING) private readonly timing: Timing) {}

  holder(roomId: string): { memberId: string; socketId: string } | null {
    const l = this.leases.get(roomId);
    return l ? { memberId: l.memberId, socketId: l.socketId } : null;
  }

  isOnline(roomId: string): boolean {
    return this.leases.has(roomId);
  }

  /** Takes the lease; returns the previous holder if it was another socket. */
  claim(
    roomId: string,
    memberId: string,
    socketId: string,
  ): { memberId: string; socketId: string } | null {
    const prev = this.leases.get(roomId);
    if (prev) clearTimeout(prev.timer);
    this.leases.set(roomId, { memberId, socketId, timer: this.arm(roomId) });
    if (!prev) this.onChange(roomId);
    return prev && prev.socketId !== socketId
      ? { memberId: prev.memberId, socketId: prev.socketId }
      : null;
  }

  /** Extends the lease if `socketId` holds it. */
  renew(roomId: string, socketId: string): boolean {
    const l = this.leases.get(roomId);
    if (!l || l.socketId !== socketId) return false;
    clearTimeout(l.timer);
    l.timer = this.arm(roomId);
    return true;
  }

  /** The room was deleted: forget its lease without announcing a change. */
  drop(roomId: string): void {
    const l = this.leases.get(roomId);
    if (l) clearTimeout(l.timer);
    this.leases.delete(roomId);
  }

  /** Drops the lease (optionally only if held by `memberId`). Returns the dropped holder. */
  release(
    roomId: string,
    memberId?: string,
  ): { memberId: string; socketId: string } | null {
    const l = this.leases.get(roomId);
    if (!l || (memberId && l.memberId !== memberId)) return null;
    clearTimeout(l.timer);
    this.leases.delete(roomId);
    this.onChange(roomId);
    return { memberId: l.memberId, socketId: l.socketId };
  }

  private arm(roomId: string): NodeJS.Timeout {
    const t = setTimeout(() => {
      this.leases.delete(roomId);
      this.onChange(roomId);
    }, this.timing.leaseMs);
    t.unref();
    return t;
  }

  onModuleDestroy(): void {
    for (const l of this.leases.values()) clearTimeout(l.timer);
    this.leases.clear();
  }
}
