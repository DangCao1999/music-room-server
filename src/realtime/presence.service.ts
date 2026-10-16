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
  /** N1: sockets playing the room on their own device ("Nghe cùng"). */
  private readonly listening = new Set<string>();
  /** Đợt 3: members who voted from a chat app, counted as present until the vote ends. */
  private readonly chatVoters = new Map<string, Map<string, number>>();

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
  remove(socketId: string): {
    memberId: string;
    roomId: string;
    wentOffline: boolean;
    stoppedListening: boolean;
  } | null {
    const binding = this.bySocket.get(socketId);
    if (!binding) return null;
    this.bySocket.delete(socketId);
    const wasListening = this.isListening(binding.memberId);
    this.listening.delete(socketId);
    const sockets = this.socketsByMember.get(binding.memberId);
    sockets?.delete(socketId);
    const wentOffline = !sockets || sockets.size === 0;
    if (wentOffline) {
      this.socketsByMember.delete(binding.memberId);
      this.membersByRoom.get(binding.roomId)?.delete(binding.memberId);
    }
    return {
      ...binding,
      wentOffline,
      stoppedListening: wasListening && !this.isListening(binding.memberId),
    };
  }

  /** Returns true when the member's listening state changed. */
  setListening(socketId: string, on: boolean): boolean {
    const binding = this.bySocket.get(socketId);
    if (!binding) return false;
    const before = this.isListening(binding.memberId);
    if (on) this.listening.add(socketId);
    else this.listening.delete(socketId);
    return before !== this.isListening(binding.memberId);
  }

  /** A chat-app voter takes part in the vote (both sides of the count) until `untilMs`. */
  addChatVoter(roomId: string, memberId: string, untilMs: number): void {
    const room = this.chatVoters.get(roomId) ?? new Map<string, number>();
    room.set(memberId, untilMs);
    this.chatVoters.set(roomId, room);
  }

  activeChatVoters(roomId: string, now = Date.now()): string[] {
    const room = this.chatVoters.get(roomId);
    if (!room) return [];
    for (const [id, until] of room) if (until <= now) room.delete(id);
    if (!room.size) this.chatVoters.delete(roomId);
    return [...room.keys()];
  }

  isListening(memberId: string): boolean {
    return this.socketsOf(memberId).some((s) => this.listening.has(s));
  }

  isOnline(memberId: string): boolean {
    return (this.socketsByMember.get(memberId)?.size ?? 0) > 0;
  }

  /** Rooms with at least one member online right now. */
  onlineRooms(): string[] {
    return [...this.membersByRoom]
      .filter(([, members]) => members.size > 0)
      .map(([roomId]) => roomId);
  }

  /** The room was deleted (its sockets are already gone): drop what is left of it. */
  forgetRoom(roomId: string): void {
    this.membersByRoom.delete(roomId);
    this.chatVoters.delete(roomId);
  }

  onlineMembers(roomId: string): Set<string> {
    return new Set(this.membersByRoom.get(roomId) ?? []);
  }

  socketsOf(memberId: string): string[] {
    return [...(this.socketsByMember.get(memberId) ?? [])];
  }
}
