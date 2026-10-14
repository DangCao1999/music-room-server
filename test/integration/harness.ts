import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import nock from 'nock';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { DEFAULT_TIMING, type Timing } from '../../src/common/timing';
import { type Env, parseEnv } from '../../src/config/env';
import type {
  Ack,
  CommandPayload,
  CommandName,
  CommandResults,
  RoomSnapshot,
  ServerEvents,
} from '../../src/contracts';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MusicRoomIoAdapter } from '../../src/realtime/io-adapter';

export const DB_URL = readFileSync(join(__dirname, '.db-url'), 'utf8').trim();

export interface TestApp {
  app: INestApplication;
  url: string;
  prisma: PrismaService;
  close(): Promise<void>;
}

/** Boots the real Nest app (gateway + Postgres) on a random port. */
export async function startApp(
  overrides: Record<string, string | undefined> = {},
  timing: Partial<Timing> = {},
): Promise<TestApp> {
  const env: Env = parseEnv({
    DATABASE_URL: DB_URL,
    PUBLIC_URL: 'http://localhost:8080',
    JWT_SECRET: 'integration-secret-integration-secret',
    DATA_DIR: mkdtempSync(join(tmpdir(), 'mr-')),
    TRUST_PROXY: 'true',
    YOUTUBE_API_KEY: 'test-key',
    NODE_ENV: 'test',
    ...overrides,
  });
  const app = await NestFactory.create(
    AppModule.forRoot(env, { ...DEFAULT_TIMING, ...timing }),
    { logger: ['error'] },
  );
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new MusicRoomIoAdapter(app, env));
  app.enableShutdownHooks();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const port = (server.address() as AddressInfo).port;
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

let ipSeq = 0;
/** Each client gets its own fake IP (X-Forwarded-For) so per-IP limits don't collide. */
export const nextIp = () =>
  `10.0.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

type Result<K extends CommandName> = K extends keyof CommandResults
  ? CommandResults[K]
  : Record<string, never>;

export class TestClient {
  readonly socket: Socket;
  snap: RoomSnapshot | null = null;
  memberId: string | null = null;
  token: string | null = null;
  readonly events: { event: string; data: unknown }[] = [];

  constructor(
    url: string,
    opts: { token?: string; ip?: string; origin?: string } = {},
  ) {
    this.token = opts.token ?? null;
    this.socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: opts.token ? { token: opts.token } : {},
      extraHeaders: {
        'x-forwarded-for': opts.ip ?? nextIp(),
        ...(opts.origin ? { origin: opts.origin } : {}),
      },
    });
    this.socket.onAny((event: string, data: unknown) => {
      this.events.push({ event, data });
      if (event === 'room:update') {
        const s = data as RoomSnapshot;
        if (!this.snap || s.version > this.snap.version) this.snap = s;
      }
      if (event === 'session:ready')
        this.memberId = (data as { memberId: string }).memberId;
    });
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
  }

  async cmd<K extends CommandName>(
    name: K,
    payload: unknown = {},
  ): Promise<Ack<Result<K>>> {
    await this.connected();
    return (await this.socket
      .timeout(10_000)
      .emitWithAck(name, payload)) as Ack<Result<K>>;
  }

  /** Command that must succeed; returns its data. */
  async ok<K extends CommandName>(
    name: K,
    payload: CommandPayload<K> | Record<string, unknown> = {},
  ): Promise<Result<K>> {
    const r = await this.cmd(name, payload);
    if (!r.ok) throw new Error(`${name} failed: ${JSON.stringify(r.error)}`);
    if ('token' in (r.data as object)) {
      this.token = (r.data as { token: string }).token;
      this.memberId = (r.data as { memberId: string }).memberId;
    }
    return r.data;
  }

  /** Waits for an event matching the predicate (also checks events already received). */
  waitFor<E extends keyof ServerEvents>(
    event: E,
    predicate: (data: Parameters<ServerEvents[E]>[0]) => boolean = () => true,
    timeoutMs = 8000,
  ): Promise<Parameters<ServerEvents[E]>[0]> {
    type D = Parameters<ServerEvents[E]>[0];
    const seen = this.events.find(
      (e) => e.event === event && predicate(e.data as D),
    );
    if (seen) return Promise.resolve(seen.data as D);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off(event as string, handler);
        reject(new Error(`timeout waiting for ${event}`));
      }, timeoutMs);
      const handler = (data: D) => {
        if (!predicate(data)) return;
        clearTimeout(timer);
        this.socket.off(event as string, handler);
        resolve(data);
      };
      this.socket.on(event as string, handler);
    });
  }

  /** Waits until the latest snapshot (current or newer — never an old one) satisfies the predicate. */
  until(
    predicate: (s: RoomSnapshot) => boolean,
    timeoutMs = 8000,
  ): Promise<RoomSnapshot> {
    if (this.snap && predicate(this.snap)) return Promise.resolve(this.snap);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off('room:update', handler);
        reject(new Error('timeout waiting for snapshot'));
      }, timeoutMs);
      const handler = () => {
        // onAny already stored the newest snapshot in this.snap
        if (this.snap && predicate(this.snap)) {
          clearTimeout(timer);
          this.socket.off('room:update', handler);
          resolve(this.snap);
        }
      };
      this.socket.on('room:update', handler);
    });
  }

  clearEvents(): void {
    this.events.length = 0;
  }

  close(): void {
    this.socket.disconnect();
  }
}

// ------------------------------------------------------------ YouTube stubs

export interface FakeVideo {
  title?: string;
  durationSec?: number | null;
  embeddable?: boolean;
  live?: boolean;
}

/** Valid-looking 11-char id that mixes cases (bare ids require it). */
export const vid = (n: number) => `Vid${String(n).padStart(8, '0')}`;
export const link = (n: number) => `https://youtu.be/${vid(n)}`;

/**
 * Persistent nock stubs for videos.list / search.list / oEmbed. Unknown ids are
 * "not found". Call `nock.cleanAll()` in afterAll.
 */
export function stubYouTube(
  videos: Record<string, FakeVideo>,
  searchResults: Record<string, string[]> = {},
) {
  nock.disableNetConnect();
  nock.enableNetConnect(/(127\.0\.0\.1|localhost)/);
  const item = (id: string) => {
    const v = videos[id];
    const d = v.durationSec;
    return {
      id,
      snippet: {
        title: v.title ?? `Song ${id}`,
        channelTitle: 'Channel',
        liveBroadcastContent: v.live ? 'live' : 'none',
        thumbnails: {
          medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
        },
      },
      contentDetails: {
        duration: d === null || d === undefined ? 'P0D' : `PT${d}S`,
      },
      status: { embeddable: v.embeddable !== false },
    };
  };
  const calls = { videos: 0, search: 0, oembed: 0 };
  nock('https://www.googleapis.com')
    .persist()
    .get(/\/youtube\/v3\/videos/)
    .reply((uri) => {
      calls.videos++;
      const ids =
        new URL(`https://x${uri}`).searchParams.get('id')?.split(',') ?? [];
      return [200, { items: ids.filter((id) => videos[id]).map(item) }];
    })
    .get(/\/youtube\/v3\/search/)
    .reply((uri) => {
      calls.search++;
      const q = new URL(`https://x${uri}`).searchParams.get('q') ?? '';
      return [
        200,
        {
          items: (searchResults[q] ?? []).map((id) => ({
            id: { videoId: id },
          })),
        },
      ];
    });
  nock('https://www.youtube.com')
    .persist()
    .get(/\/oembed/)
    .reply((uri) => {
      calls.oembed++;
      const u = new URL(`https://x${uri}`).searchParams.get('url') ?? '';
      const id = new URL(u).searchParams.get('v') ?? '';
      const v = videos[id];
      if (!v) return [404, 'Not Found'];
      if (v.embeddable === false) return [401, 'Unauthorized'];
      return [200, { title: v.title ?? `Song ${id}`, author_name: 'Channel' }];
    });
  return calls;
}

// ------------------------------------------------------------ scenario helpers

let roomSeq = 0;
export async function createRoom(
  url: string,
  opts: { displayName?: string; pin?: string; setupPassword?: string } = {},
): Promise<{ admin: TestClient; code: string }> {
  const admin = new TestClient(url);
  const r = await admin.ok('room:create', {
    name: `Room ${++roomSeq}`,
    displayName: opts.displayName ?? 'An',
    adminPin: opts.pin ?? '1234',
    ...(opts.setupPassword ? { setupPassword: opts.setupPassword } : {}),
  });
  await admin.until(() => true);
  return { admin, code: r.code };
}

export async function joinRoom(
  url: string,
  code: string,
  displayName: string,
): Promise<TestClient> {
  const c = new TestClient(url);
  await c.ok('room:join', { code, displayName });
  await c.until((s) => s.members.some((m) => m.id === c.memberId));
  return c;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
