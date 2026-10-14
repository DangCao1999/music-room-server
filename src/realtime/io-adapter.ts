import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { Server, ServerOptions } from 'socket.io';
import type { Env } from '../config/env';

/** R-42: packets over 100 KB disconnect the socket. */
export const MAX_PACKET_BYTES = 100_000;

/**
 * Browser origins allowed to open a socket (TC-198): same host as the request
 * (works behind Caddy and for LAN IPs), PUBLIC_URL, or CORS_ORIGINS. Requests
 * without an Origin header (non-browser clients) are allowed.
 */
export function originAllowed(req: IncomingMessage, env: Env): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === req.headers.host) return true;
  const allowed = [new URL(env.PUBLIC_URL).origin, ...env.CORS_ORIGINS];
  return allowed.includes(origin);
}

export class MusicRoomIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly env: Env,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: MAX_PACKET_BYTES,
      cors: this.env.CORS_ORIGINS.length
        ? { origin: this.env.CORS_ORIGINS, credentials: false }
        : undefined,
      allowRequest: (
        req: IncomingMessage,
        cb: (err: string | null | undefined, success: boolean) => void,
      ) => cb(null, originAllowed(req, this.env)),
    }) as Server;
  }
}
