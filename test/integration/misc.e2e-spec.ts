import nock from 'nock';
import { io } from 'socket.io-client';
import {
  createRoom,
  joinRoom,
  sleep,
  startApp,
  stubYouTube,
  type TestApp,
  TestClient,
  vid,
} from './harness';

const RESULTS = Array.from({ length: 12 }, (_, i) => vid(600 + i));
const videos = Object.fromEntries(
  RESULTS.map((id, i) => [
    id,
    { title: `Lạc Trôi ${i}`, durationSec: 230 + i },
  ]),
);
videos[vid(700)] = { title: 'Seed', durationSec: 200 };

describe('Search (TC-140…TC-150)', () => {
  let t: TestApp;
  let calls: { search: number; videos: number };
  beforeAll(async () => {
    calls = stubYouTube(videos, {
      'lac troi': RESULTS.slice(0, 10),
      'Sơn Tùng': RESULTS.slice(0, 3),
    });
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-140 returns ≤10 results with duration; a result can be added', async () => {
    const { admin } = await createRoom(t.url);
    const { results } = await admin.ok('search:query', { q: 'lac troi' });
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({
      title: 'Lạc Trôi 0',
      durationSec: 230,
      channel: 'Channel',
    });
    const r = await admin.ok('queue:add', { input: results[0].id });
    expect(r.title).toBe('Lạc Trôi 0');
    admin.close();
  });

  it('TC-143 normalized query hits the cache (no second search.list call)', async () => {
    const { admin } = await createRoom(t.url);
    const before = calls.search;
    await admin.ok('search:query', { q: 'Sơn Tùng' });
    await admin.ok('search:query', { q: 'son  TUNG' });
    expect(calls.search).toBe(before + 1);
    admin.close();
  });

  it('TC-145 11th search within the hour → RATE_LIMITED with seconds', async () => {
    const { admin } = await createRoom(t.url);
    for (let i = 0; i < 10; i++)
      await admin.ok('search:query', { q: 'lac troi' });
    const r = await admin.cmd('search:query', { q: 'lac troi' });
    expect(r).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(!r.ok && (r.error.params!.seconds as number)).toBeGreaterThan(3500);
    admin.close();
  });
});

describe('Search without key (TC-141)', () => {
  it('SEARCH_UNAVAILABLE while link adds still work', async () => {
    stubYouTube(videos);
    const t = await startApp({ YOUTUBE_API_KEY: undefined });
    const { admin } = await createRoom(t.url);
    expect(await admin.cmd('search:query', { q: 'x' })).toEqual({
      ok: false,
      error: { code: 'SEARCH_UNAVAILABLE' },
    });
    expect(
      (await admin.cmd('queue:add', { input: `https://youtu.be/${vid(700)}` }))
        .ok,
    ).toBe(true);
    admin.close();
    await t.close();
    nock.cleanAll();
  });
});

describe('Chat, reactions, DJ, activity (TC-160…TC-169)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-160 chat reaches everyone with the server-side name', async () => {
    const { admin, code } = await createRoom(t.url, { displayName: 'An' });
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('chat:send', { content: '  hello  ' });
    const m = await b.waitFor('chat:receive');
    expect(m).toMatchObject({
      displayName: 'An',
      content: 'hello',
      memberId: admin.memberId,
    });
    expect(new Date(m.createdAt).toISOString()).toBe(m.createdAt);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-162 6th message within 10 s → RATE_LIMITED', async () => {
    const { admin } = await createRoom(t.url);
    for (let i = 0; i < 5; i++)
      await admin.ok('chat:send', { content: `m${i}` });
    expect(await admin.cmd('chat:send', { content: 'm6' })).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    admin.close();
  });

  it('TC-163 markup is stored verbatim (rendered as text by the client)', async () => {
    const { admin } = await createRoom(t.url);
    await admin.ok('chat:send', { content: '<img src=x onerror=alert(1)>' });
    const m = await admin.waitFor('chat:receive');
    expect(m.content).toBe('<img src=x onerror=alert(1)>');
    admin.close();
  });

  it('TC-164 history keeps the newest 200 messages', async () => {
    const { admin, code } = await createRoom(t.url);
    const room = await t.prisma.room.findUniqueOrThrow({ where: { code } });
    const base = Date.now() - 1_000_000;
    await t.prisma.chatMessage.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        roomId: room.id,
        memberId: admin.memberId!,
        displayName: 'An',
        content: `old ${i}`,
        createdAt: new Date(base + i),
      })),
    });
    await admin.ok('chat:send', { content: 'newest' });
    await sleep(100);
    const again = new TestClient(t.url, { token: admin.token! });
    const hist = await again.waitFor('chat:history');
    expect(hist).toHaveLength(200);
    expect(hist[hist.length - 1].content).toBe('newest');
    expect(hist[0].content).toBe('old 1');
    [admin, again].forEach((c) => c.close());
  });

  it('TC-165/TC-166 reactions: allowed emoji broadcast; 11th within 10 s rejected', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('room:reaction', { emoji: '🔥' });
    expect(await b.waitFor('room:reaction')).toEqual({
      emoji: '🔥',
      memberId: admin.memberId,
    });
    expect(await admin.cmd('room:reaction', { emoji: '💩' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    for (let i = 0; i < 9; i++)
      await admin.ok('room:reaction', { emoji: '👏' });
    expect(await admin.cmd('room:reaction', { emoji: '👏' })).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    [admin, b].forEach((c) => c.close());
  });

  it('TC-167 DJ cooldown 1.5 s', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('dj:trigger', { soundType: 'airhorn' });
    expect(await b.waitFor('dj:event')).toMatchObject({
      soundType: 'airhorn',
      displayName: 'An',
    });
    expect(await admin.cmd('dj:trigger', { soundType: 'clap' })).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    await sleep(1600);
    expect((await admin.cmd('dj:trigger', { soundType: 'clap' })).ok).toBe(
      true,
    );
    [admin, b].forEach((c) => c.close());
  });

  it('TC-168 allowGuestDj gives new members DJ', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('room:settings', { allowGuestDj: true });
    const b = await joinRoom(t.url, code, 'Bình');
    expect(b.snap!.members.find((m) => m.id === b.memberId)!.canDj).toBe(true);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-169 activity history is capped at 200 and newest first', async () => {
    const { admin, code } = await createRoom(t.url);
    const room = await t.prisma.room.findUniqueOrThrow({ where: { code } });
    await t.prisma.activityLog.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        roomId: room.id,
        type: 'test',
        message: `log ${i}`,
        createdAt: new Date(Date.now() - 1_000_000 + i),
      })),
    });
    const b = await joinRoom(t.url, code, 'Bình'); // logs "đã vào phòng" and trims
    await sleep(150);
    const again = new TestClient(t.url, { token: b.token! });
    const logs = await again.waitFor('activity:history');
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('đã vào phòng');
    expect(
      await t.prisma.activityLog.count({ where: { roomId: room.id } }),
    ).toBe(200);
    [admin, b, again].forEach((c) => c.close());
  });

  it('TC-180 changing the threshold updates "votes/required" for everyone', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('queue:add', { input: `https://youtu.be/${vid(700)}` });
    const others = await Promise.all(
      ['B', 'C', 'D'].map((n) => joinRoom(t.url, code, n)),
    );
    await admin.ok('room:settings', { skipThreshold: 0.75 });
    const s = await others[0].until(
      (x) => x.room.settings.skipThreshold === 0.75,
    );
    expect(s.nowPlaying!.skip.required).toBe(3);
    [admin, ...others].forEach((c) => c.close());
  });
});

describe('Security & limits (TC-010, TC-194…TC-198)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-010 21st create from one IP within a minute → RATE_LIMITED', async () => {
    const ip = '10.200.0.1';
    const c = new TestClient(t.url, { ip });
    const p = { name: 'R', displayName: 'An', adminPin: '1234' };
    for (let i = 0; i < 20; i++)
      expect((await c.cmd('room:create', p)).ok).toBe(true);
    expect(await c.cmd('room:create', p)).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    c.close();
  });

  it('TC-194 a 200 KB packet drops the socket; the server keeps serving', async () => {
    const c = new TestClient(t.url);
    await c.connected();
    const gone = new Promise<string>((r) =>
      c.socket.once('disconnect', (reason) => r(reason)),
    );
    c.socket.emit('chat:send', { content: 'x'.repeat(200_000) });
    expect(await gone).toBeTruthy();
    const d = new TestClient(t.url);
    expect((await d.cmd('room:peek', { code: 'ZZZZZZ' })).ok).toBe(false);
    d.close();
  });

  it('TC-197 nothing secret ever reaches clients (I-08)', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    const device = new TestClient(t.url);
    await device.ok('host:register', { code, pin: '1234' });
    await device.ok('player:claim');
    await admin.ok('queue:add', { input: `https://youtu.be/${vid(700)}` });
    await admin.ok('chat:send', { content: 'hi' });
    await sleep(200);
    const forbidden = new Set([
      'token',
      'adminPinHash',
      'socketId',
      'tokenVersion',
      'ip',
      'displayNameKey',
    ]);
    const scan = (v: unknown, path: string): string[] => {
      if (!v || typeof v !== 'object') return [];
      return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) =>
        forbidden.has(k) ? [`${path}.${k}`] : scan(x, `${path}.${k}`),
      );
    };
    const leaks = [admin, b, device].flatMap((c) =>
      c.events.flatMap((e) => scan(e.data, e.event)),
    );
    expect(leaks).toEqual([]);
    [admin, b, device].forEach((c) => c.close());
  });

  it('TC-198 a foreign browser origin cannot open a socket', async () => {
    const s = io(t.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: 'http://evil.test' },
    });
    const err = await new Promise<Error>((r) => s.once('connect_error', r));
    expect(err).toBeInstanceOf(Error);
    s.close();
    const ok = new TestClient(t.url, { origin: 'http://localhost:8080' });
    await ok.connected();
    ok.close();
  });
});

describe('Search cache does not store empty results', () => {
  it('an empty answer is retried next time', async () => {
    const calls = stubYouTube(videos, { 'nothing yet': [] });
    const t = await startApp();
    const { admin } = await createRoom(t.url);
    await admin.ok('search:query', { q: 'nothing yet' });
    await admin.ok('search:query', { q: 'nothing yet' });
    expect(calls.search).toBe(2);
    admin.close();
    await t.close();
    nock.cleanAll();
  });
});
