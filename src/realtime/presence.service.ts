import { Injectable } from '@nestjs/common';

/** memberId ↔ sockets. A member is online while at least one socket is connected (R-07). */
@Injectable()
export class PresenceService {
  private readonly socketsByMember = new Map<string, Set<string>>();
  private readonly membersByRoom = new Map<string, Set<string>>();
  private readonly bySocket = new Map<
    string,
    { memberId: string; roomId: string }
  >();

  /** Returns true when the member just came online. */
  add(memberId: string, roomId: string, socketId: string): boolean {
    this.bySocket.set(socketId, { memberId, roomId });
    const sockets = this.socketsByMember.get(memberId) ?? new Set<string>();
    const cameOnline = sockets.size === 0;
    sockets.add(socketId);
    this.socketsByMember.set(memberId, sockets);
    const members = this.membersByRoom.get(roomId) ?? new Set<string>();
    members.add(memberId);
    this.membersByRoom.set(roomId, members);
    return cameOnline;
  }

  /** Returns the binding and whether the member just went offline. */
  remove(
    socketId: string,
  ): { memberId: string; roomId: string; wentOffline: boolean } | null {
    const binding = this.bySocket.get(socketId);
    if (!binding) return null;
    this.bySocket.delete(socketId);
    const sockets = this.socketsByMember.get(binding.memberId);
    sockets?.delete(socketId);
    const wentOffline = !sockets || sockets.size === 0;
    if (wentOffline) {
      this.socketsByMember.delete(binding.memberId);
      this.membersByRoom.get(binding.roomId)?.delete(binding.memberId);
    }
    return { ...binding, wentOffline };
  }

  isOnline(memberId: string): boolean {
    return (this.socketsByMember.get(memberId)?.size ?? 0) > 0;
  }

  onlineMembers(roomId: string): Set<string> {
    return new Set(this.membersByRoom.get(roomId) ?? []);
  }

  socketsOf(memberId: string): string[] {
    return [...(this.socketsByMember.get(memberId) ?? [])];
  }
}
