import nock from 'nock';
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

const yt = (n: number) => `https://www.youtube.com/watch?v=${vid(n)}`;
const videos: Record<string, { durationSec: number | null; title?: string }> =
  {};
for (let i = 100; i < 200; i++)
  videos[vid(i)] = { durationSec: 200, title: `Song ${i}` };
videos[vid(300)] = { durationSec: 1, title: 'One second' };
// fallback playlist: 25 videos
const FALLBACK = Array.from({ length: 25 }, (_, i) => vid(400 + i));
for (const id of FALLBACK)
  videos[id] = { durationSec: 1, title: `Fallback ${id}` };
const PLAYLIST = 'PLfallbackPlaylist0001';
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST}`;

let next = 100;
const fresh = () => yt(next++);

function stubPlaylists() {
  nock('https://www.googleapis.com')
    .persist()
    .get(/\/youtube\/v3\/playlistItems/)
    .reply((uri) => {
      const id = new URL(`https://x${uri}`).searchParams.get('playlistId');
      if (id !== PLAYLIST)
        return [404, { error: { errors: [{ reason: 'playlistNotFound' }] } }];
      return [
        200,
        { items: FALLBACK.map((v) => ({ contentDetails: { videoId: v } })) },
      ];
    });
}

describe('Playback, skipping and voting (TC-090…TC-109)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    stubPlaylists();
    t = await startApp({}, { leaseMs: 800, advanceGraceMs: 300 });
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  async function playing() {
    const { admin, code } = await createRoom(t.url);
    const device = new TestClient(t.url);
    await device.ok('host:register', { code, pin: '1234' });
    await device.ok('player:claim');
    const cur = await admin.ok('queue:add', { input: fresh() });
    return { admin, device, code, cur: cur.queueItemId };
  }

  it('TC-090 ended → next PLAYING, previous PLAYED, lastPlayedAt set, version +1', async () => {
    const { admin, device, code, cur } = await playing();
    const b = await joinRoom(t.url, code, 'Bình');
    const nextItem = await b.ok('queue:add', { input: fresh() });
    const v = admin.snap!.version;
    await device.ok('player:report', { queueItemId: cur, event: 'ended' });
    const s = await admin.until(
      (x) => x.nowPlaying?.item.id === nextItem.queueItemId,
    );
    expect(s.version).toBeGreaterThan(v);
    expect(
      (await t.prisma.queueItem.findUnique({ where: { id: cur } }))!.status,
    ).toBe('PLAYED');
    const m = await t.prisma.member.findUnique({ where: { id: b.memberId! } });
    expect(m!.lastPlayedAt).not.toBeNull();
    const cmd = await device.waitFor(
      'player:command',
      (c) => c.queueItemId === nextItem.queueItemId,
    );
    expect(cmd.status).toBe('PLAYING');
    expect(typeof cmd.videoId).toBe('string');
    [admin, device, b].forEach((c) => c.close());
  });

  it('TC-091 duplicate ended → STALE_ITEM, nothing skipped twice', async () => {
    const { admin, device, cur } = await playing();
    const n1 = await admin.ok('queue:add', { input: fresh() });
    await admin.ok('queue:add', { input: fresh() });
    await device.ok('player:report', { queueItemId: cur, event: 'ended' });
    expect(
      await device.cmd('player:report', { queueItemId: cur, event: 'ended' }),
    ).toMatchObject({
      error: { code: 'STALE_ITEM' },
    });
    const s = await admin.until(
      (x) => x.nowPlaying?.item.id === n1.queueItemId,
    );
    expect(s.queue).toHaveLength(1);
    [admin, device].forEach((c) => c.close());
  });

  it('TC-092 ended and the deciding vote at the same time → exactly one advance', async () => {
    const { admin, device, code, cur } = await playing();
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('queue:add', { input: fresh() });
    await admin.ok('queue:add', { input: fresh() });
    // 2 voters online @50% → 1 vote needed: race the vote against "ended"
    await Promise.all([
      b.cmd('queue:vote-skip', { queueItemId: cur }),
      device.cmd('player:report', { queueItemId: cur, event: 'ended' }),
    ]);
    await sleep(200);
    const rows = await t.prisma.queueItem.findMany({
      where: { room: { code } },
    });
    expect(rows.filter((r) => r.status === 'PLAYING')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'QUEUED')).toHaveLength(1);
    [admin, device, b].forEach((c) => c.close());
  });

  it('TC-093/TC-096 5 online @50% need 3; repeated votes count once', async () => {
    const { admin, device, code, cur } = await playing();
    const others = await Promise.all(
      ['B', 'C', 'D', 'E'].map((n) => joinRoom(t.url, code, n)),
    );
    await admin.ok('queue:add', { input: fresh() });
    await others[0].ok('queue:vote-skip', { queueItemId: cur });
    await others[0].ok('queue:vote-skip', { queueItemId: cur });
    await others[1].ok('queue:vote-skip', { queueItemId: cur });
    let s = await admin.until((x) => x.nowPlaying?.skip.votes === 2);
    expect(s.nowPlaying!.skip).toMatchObject({ votes: 2, required: 3 });
    await others[2].ok('queue:vote-skip', { queueItemId: cur });
    s = await admin.until((x) => x.nowPlaying?.item.id !== cur);
    expect(
      (await t.prisma.queueItem.findUnique({ where: { id: cur } }))!.status,
    ).toBe('SKIPPED');
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.type === 'track_skip',
    );
    expect(log.message).toMatch(/đã bị bỏ qua sau 3 phiếu$/);
    [admin, device, ...others].forEach((c) => c.close());
  });

  it('review P2-3: shown order == played order when a member left with a queued track (I-05)', async () => {
    const { admin, device, code, cur } = await playing();
    const a = await joinRoom(t.url, code, 'A');
    const b = await joinRoom(t.url, code, 'B');
    const a1 = await a.ok('queue:add', { input: fresh() });
    // A's track plays first, so A gets a recent lastPlayedAt
    await device.ok('player:report', { queueItemId: cur, event: 'ended' });
    await admin.until((x) => x.nowPlaying?.item.id === a1.queueItemId);
    await a.ok('queue:add', { input: fresh() });
    const b1 = await b.ok('queue:add', { input: fresh() });
    await a.ok('room:leave'); // A's queued track stays (R-11)
    const shown = (
      await admin.until((x) => !x.members.some((m) => m.id === a.memberId))
    ).queue[0].id;
    expect(shown).toBe(b1.queueItemId); // B has not played yet → B first
    await device.ok('player:report', {
      queueItemId: a1.queueItemId,
      event: 'ended',
    });
    const played = (
      await admin.until((x) => x.nowPlaying?.item.id !== a1.queueItemId)
    ).nowPlaying!.item.id;
    expect(played).toBe(shown);
    [admin, device, a, b].forEach((c) => c.close());
  });

  it('TC-097 offline voters stop counting (I-09); TC-098 a leave can complete the vote', async () => {
    const { admin, device, code, cur } = await playing();
    const b = await joinRoom(t.url, code, 'B');
    const c = await joinRoom(t.url, code, 'C');
    const d = await joinRoom(t.url, code, 'D');
    await admin.ok('room:settings', { skipThreshold: 0.75 });
    await admin.ok('queue:add', { input: fresh() });
    await b.ok('queue:vote-skip', { queueItemId: cur });
    let s = await admin.until((x) => x.nowPlaying?.skip.votes === 1);
    expect(s.nowPlaying!.skip.required).toBe(3); // 4 online × 0.75
    b.close(); // voter goes offline
    s = await admin.until((x) => x.nowPlaying?.skip.votes === 0);
    expect(s.nowPlaying!.skip.required).toBe(3); // 3 online × 0.75 = 2.25 → 3
    await c.ok('queue:vote-skip', { queueItemId: cur });
    await d.ok('queue:vote-skip', { queueItemId: cur });
    s = await admin.until((x) => x.nowPlaying?.skip.votes === 2);
    await admin.ok('room:settings', { skipThreshold: 0.5 }); // 3 online @50% → 2: settings re-evaluate
    s = await admin.until((x) => x.nowPlaying?.item.id !== cur);
    [admin, device, c, d].forEach((x) => x.close());
  });

  it('TC-099 admin "Bỏ qua ngay" → SKIPPED and logged', async () => {
    const { admin, device, cur } = await playing();
    await admin.ok('playback:control', { action: 'skip', queueItemId: cur });
    await admin.until((x) => x.status === 'IDLE');
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.type === 'track_skip',
    );
    expect(log.message).toMatch(/^đã bỏ qua "/);
    [admin, device].forEach((c) => c.close());
  });

  it('TC-100 pause freezes the position; play resumes from it', async () => {
    const { admin, device, cur } = await playing();
    await sleep(500);
    await admin.ok('playback:control', { action: 'pause', queueItemId: cur });
    const paused = await admin.until((x) => x.status === 'PAUSED');
    const p1 = paused.nowPlaying!.positionSec;
    await sleep(600);
    await admin.ok('playback:control', { action: 'play', queueItemId: cur });
    const resumed = await admin.until((x) => x.status === 'PLAYING');
    expect(Math.abs(resumed.nowPlaying!.positionSec - p1)).toBeLessThan(0.3);
    [admin, device].forEach((c) => c.close());
  });

  it('TC-101 pause while IDLE → STALE_ITEM', async () => {
    const { admin } = await createRoom(t.url);
    expect(
      await admin.cmd('playback:control', {
        action: 'pause',
        queueItemId: 'none',
      }),
    ).toMatchObject({
      error: { code: 'STALE_ITEM' },
    });
    admin.close();
  });

  it('TC-102 seek bounds: 0 and duration ok, duration+1 VALIDATION', async () => {
    const { admin, device, cur } = await playing();
    expect(
      (
        await admin.cmd('playback:control', {
          action: 'seek',
          queueItemId: cur,
          positionSec: 0,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await admin.cmd('playback:control', {
          action: 'seek',
          queueItemId: cur,
          positionSec: 200,
        })
      ).ok,
    ).toBe(true);
    expect(
      await admin.cmd('playback:control', {
        action: 'seek',
        queueItemId: cur,
        positionSec: 201,
      }),
    ).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    [admin, device].forEach((c) => c.close());
  });

  it('TC-103 silent player: server advances at duration + grace, not before', async () => {
    const { admin } = await createRoom(t.url);
    const one = await admin.ok('queue:add', { input: yt(300) }); // 1 s track, grace 300 ms
    await sleep(900);
    expect(admin.snap!.nowPlaying?.item.id).toBe(one.queueItemId);
    await admin.until((x) => x.status === 'IDLE', 3000);
    expect(
      (await t.prisma.queueItem.findUnique({ where: { id: one.queueItemId } }))!
        .status,
    ).toBe('PLAYED');
    admin.close();
  });

  it('TC-104 player error 150 → SKIPPED and logged; 999 → VALIDATION', async () => {
    const { admin, device, cur } = await playing();
    expect(
      await device.cmd('player:report', {
        queueItemId: cur,
        event: 'error',
        errorCode: 999,
      }),
    ).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    await device.ok('player:report', {
      queueItemId: cur,
      event: 'error',
      errorCode: 150,
    });
    await admin.until((x) => x.status === 'IDLE');
    expect(
      (await t.prisma.queueItem.findUnique({ where: { id: cur } }))!.status,
    ).toBe('SKIPPED');
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.type === 'track_error',
    );
    expect(log.message).toContain('mã 150');
    [admin, device].forEach((c) => c.close());
  });

  it('TC-105 fallback playlist: starts when idle, never repeats within the last 20', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('room:settings', { fallbackPlaylistUrl: PLAYLIST_URL });
    const s = await admin.until((x) => x.status === 'PLAYING');
    expect(s.nowPlaying!.item.addedBy).toBeNull();
    // 1-second fallback tracks advance via the server timer; wait for 22 picks.
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      const n = await t.prisma.queueItem.count({
        where: { room: { code }, addedById: null },
      });
      if (n >= 22) break;
      await sleep(500);
    }
    const picks = await t.prisma.queueItem.findMany({
      where: { room: { code }, addedById: null },
      orderBy: { addedAt: 'asc' },
      select: { trackId: true },
    });
    expect(picks.length).toBeGreaterThanOrEqual(21);
    for (let i = 20; i < picks.length; i++) {
      const window = picks.slice(i - 20, i).map((p) => p.trackId);
      expect(window).not.toContain(picks[i].trackId);
    }
    await admin.ok('room:settings', { fallbackPlaylistUrl: null });
    admin.close();
  }, 60_000);

  it('TC-106 last track ends without fallback → IDLE', async () => {
    const { admin, device, cur } = await playing();
    await device.ok('player:report', { queueItemId: cur, event: 'ended' });
    const s = await admin.until((x) => x.status === 'IDLE');
    expect(s.nowPlaying).toBeNull();
    const cmd = await device.waitFor(
      'player:command',
      (c) => c.status === 'IDLE',
    );
    expect(cmd.queueItemId).toBeNull();
    [admin, device].forEach((c) => c.close());
  });

  it('TC-107 unreadable fallback playlist → stays IDLE, no loop', async () => {
    const { admin } = await createRoom(t.url);
    await admin.ok('room:settings', {
      fallbackPlaylistUrl:
        'https://www.youtube.com/playlist?list=PLdoesNotExist000',
    });
    await sleep(800);
    expect(admin.snap!.status).toBe('IDLE');
    admin.close();
  });
});

describe('Player device and lease (TC-120…TC-130)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp({}, { leaseMs: 800, advanceGraceMs: 300 });
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-120 host:register + claim → "Máy phát" device, player online, gets a command', async () => {
    const { admin, code } = await createRoom(t.url);
    const device = new TestClient(t.url);
    await device.ok('host:register', { code, pin: '1234' });
    await device.ok('player:claim');
    const s = await admin.until(
      (x) => x.player.online && x.player.memberId === device.memberId,
    );
    expect(s.members.find((m) => m.id === device.memberId)).toMatchObject({
      displayName: 'Máy phát',
      isDevice: true,
      canPlay: true,
    });
    expect(s.members.find((m) => m.id === admin.memberId)!.canPlay).toBe(false);
    await device.waitFor('player:command');
    [admin, device].forEach((c) => c.close());
  });

  it('TC-121 wrong PIN on the host page shares the lockout with admin:claim', async () => {
    const { admin, code } = await createRoom(t.url);
    const ip = '10.9.9.9';
    const h = new TestClient(t.url, { ip });
    expect(await h.cmd('host:register', { code, pin: '0000' })).toEqual({
      ok: false,
      error: { code: 'PIN_INVALID', params: { remaining: 4 } },
    });
    const b = new TestClient(t.url, { ip });
    await b.ok('room:join', { code, displayName: 'Bình' });
    expect(await b.cmd('admin:claim', { pin: '0000' })).toMatchObject({
      error: { params: { remaining: 3 } },
    });
    [admin, h, b].forEach((c) => c.close());
  });

  it('TC-122 a second device takes over; the first is told "replaced"', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('queue:add', { input: fresh() });
    const d1 = new TestClient(t.url);
    await d1.ok('host:register', { code, pin: '1234' });
    await d1.ok('player:claim');
    const d2 = new TestClient(t.url);
    await d2.ok('host:register', { code, pin: '1234' });
    expect(
      d2.snap!.members.find((m) => m.id === d2.memberId)!.displayName,
    ).toBe('Máy phát 2');
    await d2.ok('player:claim');
    expect(await d1.waitFor('player:revoked')).toEqual({ reason: 'replaced' });
    const cmd = await d2.waitFor('player:command');
    expect(cmd.status).toBe('PLAYING');
    expect(cmd.positionSec).toBeGreaterThanOrEqual(0);
    // "Phát ở máy này" on d1 takes it back
    await d1.ok('player:claim');
    expect(await d2.waitFor('player:revoked')).toEqual({ reason: 'replaced' });
    [admin, d1, d2].forEach((c) => c.close());
  });

  it('TC-123/TC-124 lease expires without reports, reclaim resumes at the stored position', async () => {
    const { admin, code } = await createRoom(t.url);
    const cur = await admin.ok('queue:add', { input: fresh() });
    const d = new TestClient(t.url);
    await d.ok('host:register', { code, pin: '1234' });
    await d.ok('player:claim');
    await admin.until((x) => x.player.online);
    await d.ok('player:report', {
      queueItemId: cur.queueItemId,
      event: 'progress',
      positionSec: 40,
    });
    const token = d.token!;
    d.close();
    await admin.until((x) => !x.player.online, 3000);
    const d2 = new TestClient(t.url, { token });
    await d2.waitFor('session:ready');
    await d2.ok('player:claim');
    const cmd = await d2.waitFor('player:command');
    expect(cmd.positionSec).toBeGreaterThanOrEqual(40);
    expect(cmd.positionSec).toBeLessThan(45);
    await admin.until((x) => x.player.online);
    [admin, d2].forEach((c) => c.close());
  });

  it('TC-123 idle player keeps its lease with heartbeats; others cannot heartbeat', async () => {
    const { admin, code } = await createRoom(t.url);
    const d = new TestClient(t.url);
    await d.ok('host:register', { code, pin: '1234' });
    await d.ok('player:claim');
    for (let i = 0; i < 4; i++) {
      await sleep(400); // lease is 800 ms in this suite
      await d.ok('player:heartbeat');
    }
    expect(admin.snap!.player.online).toBe(true);
    expect(await admin.cmd('player:heartbeat')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    [admin, d].forEach((c) => c.close());
  });

  it('review P1-2: an expired lease on a still-connected player is re-granted by its next heartbeat', async () => {
    const { admin, code } = await createRoom(t.url);
    const d = new TestClient(t.url);
    await d.ok('host:register', { code, pin: '1234' });
    await d.ok('player:claim');
    await admin.until((x) => x.player.online);
    await admin.until((x) => !x.player.online, 3000); // silent > 800 ms lease
    d.clearEvents();
    await d.ok('player:heartbeat');
    await admin.until(
      (x) => x.player.online && x.player.memberId === d.memberId,
    );
    await d.waitFor('player:command'); // gets the current state again
    // a socket that is not the player still cannot heartbeat
    expect(await admin.cmd('player:heartbeat')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    [admin, d].forEach((c) => c.close());
  });

  it('review P2-4: a person named "Máy phát" does not break host registration', async () => {
    const { admin, code } = await createRoom(t.url);
    const human = await joinRoom(t.url, code, 'Máy phát');
    const d = new TestClient(t.url);
    await d.ok('host:register', { code, pin: '1234' });
    const s = await admin.until((x) =>
      x.members.some((m) => m.id === d.memberId),
    );
    expect(s.members.find((m) => m.id === d.memberId)!.displayName).toBe(
      'Máy phát 2',
    );
    [admin, human, d].forEach((c) => c.close());
  });

  it('TC-125 reports from a socket without the lease → FORBIDDEN', async () => {
    const { admin } = await createRoom(t.url);
    const cur = await admin.ok('queue:add', { input: fresh() });
    expect(
      await admin.cmd('player:report', {
        queueItemId: cur.queueItemId,
        event: 'ended',
      }),
    ).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    admin.close();
  });

  it('TC-129 a canPlay member can be the player from the room page', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    expect(await b.cmd('player:claim')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    await admin.ok('permission:set', { memberId: b.memberId!, canPlay: true });
    await b.ok('player:claim');
    await admin.until(
      (x) => x.player.memberId === b.memberId && x.player.online,
    );
    [admin, b].forEach((c) => c.close());
  });

  it('TC-130 kicking the device stops it and clears the lease', async () => {
    const { admin, code } = await createRoom(t.url);
    const d = new TestClient(t.url);
    await d.ok('host:register', { code, pin: '1234' });
    await d.ok('player:claim');
    await admin.until((x) => x.player.online);
    await admin.ok('member:kick', { memberId: d.memberId! });
    expect(await d.waitFor('player:revoked')).toEqual({ reason: 'kicked' });
    expect(await d.waitFor('session:revoked')).toEqual({ reason: 'kicked' });
    await admin.until((x) => !x.player.online && x.player.memberId === null);
    [admin, d].forEach((c) => c.close());
  });
});

describe('Restart (TC-108, TC-199)', () => {
  it('state survives a restart and an ended-while-down track advances', async () => {
    stubYouTube(videos);
    let t = await startApp({}, { leaseMs: 800, advanceGraceMs: 300 });
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('chat:send', { content: 'trước khi restart' });
    const one = await admin.ok('queue:add', { input: yt(300) }); // 1 s
    const queued = await b.ok('queue:add', { input: fresh() });
    const token = b.token!;
    [admin, b].forEach((c) => c.close());
    await t.close();
    await sleep(1500); // the 1 s track ends while the server is down
    t = await startApp({}, { leaseMs: 800, advanceGraceMs: 300 });
    const back = new TestClient(t.url, { token });
    const s = await back.until(
      (x) => x.nowPlaying?.item.id === queued.queueItemId,
      5000,
    );
    expect(
      (await t.prisma.queueItem.findUnique({ where: { id: one.queueItemId } }))!
        .status,
    ).toBe('PLAYED');
    expect(s.room.code).toBe(code);
    const chat = await back.waitFor('chat:history');
    expect(chat.map((m) => m.content)).toContain('trước khi restart');
    back.close();
    await t.close();
    nock.cleanAll();
  });
});
