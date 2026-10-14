import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { RevokeReason, ServerEvents } from '../contracts';
import { PresenceService } from './presence.service';

type EventName = keyof ServerEvents;
type EventData<E extends EventName> = Parameters<ServerEvents[E]>[0];

export const roomChannel = (roomId: string) => `room:${roomId}`;

/** Thin wrapper over the Socket.IO server so domain services never touch sockets directly. */
@Injectable()
export class Broadcaster {
  private server: Server | null = null;

  constructor(private readonly presence: PresenceService) {}

  attach(server: Server): void {
    this.server = server;
  }

  toRoom<E extends EventName>(
    roomId: string,
    event: E,
    data: EventData<E>,
  ): void {
    this.server?.to(roomChannel(roomId)).emit(event, data);
  }

  toSocket<E extends EventName>(
    socketId: string,
    event: E,
    data: EventData<E>,
  ): void {
    this.server?.to(socketId).emit(event, data);
  }

  toMember<E extends EventName>(
    memberId: string,
    event: E,
    data: EventData<E>,
  ): void {
    for (const id of this.presence.socketsOf(memberId))
      this.toSocket(id, event, data);
  }

  /** R-10 / R-11: tell every tab of the member why, then drop the sockets. */
  revokeMember(memberId: string, reason: RevokeReason): void {
    for (const id of this.presence.socketsOf(memberId)) {
      this.toSocket(id, 'session:revoked', { reason });
      this.server?.sockets.sockets.get(id)?.disconnect(true);
    }
  }
}
