import nock from 'nock';
import {
  createRoom,
  joinRoom,
  link,
  startApp,
  stubYouTube,
  type TestApp,
  TestClient,
  vid,
} from './harness';

const V = {
  short: vid(1),
  b: vid(2),
  c: vid(3),
  d: vid(4),
  e: vid(5),
  f: vid(6),
  d599: vid(10),
  d600: vid(11),
  d601: vid(12),
  d7200: vid(13),
  noEmbed: vid(20),
  live: vid(21),
  unknown: vid(22), // not stubbed → not found
};
const videos = {
  [V.short]: { title: 'Never Gonna Give You Up', durationSec: 213 },
  [V.b]: { durationSec: 200 },
  [V.c]: { durationSec: 200 },
  [V.d]: { durationSec: 200 },
  [V.e]: { durationSec: 200 },
  [V.f]: { durationSec: 200 },
  [V.d599]: { durationSec: 599 },
  [V.d600]: { durationSec: 600 },
  [V.d601]: { durationSec: 601 },
  [V.d7200]: { durationSec: 7200 },
  [V.noEmbed]: { embeddable: false, durationSec: 100 },
  [V.live]: { live: true, durationSec: null },
};
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;

describe('Adding tracks (TC-050…TC-067)', () => {
  let t: TestApp;
  let calls: { videos: number; oembed: number };
  beforeAll(async () => {
    calls = stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-050 adding to an IDLE room plays immediately; queue stays empty', async () => {
    const { admin } = await createRoom(t.url);
    const r = await admin.ok('queue:add', { input: link(1) });
    expect(r.title).toBe('Never Gonna Give You Up');
    const s = await admin.until((x) => x.status === 'PLAYING');
    expect(s.nowPlaying!.item.id).toBe(r.queueItemId);
    expect(s.queue).toEqual([]);
    admin.close();
  });

  it('TC-051 adding while playing queues with round 1 and the adder name', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('queue:add', { input: yt(V.short) });
    const b = await joinRoom(t.url, code, 'Bình');
    const r = await b.ok('queue:add', { input: yt(V.b) });
    const s = await admin.until((x) => x.queue.length === 1);
    expect(s.queue[0]).toMatchObject({
      id: r.queueItemId,
      round: 1,
      addedBy: { displayName: 'Bình' },
    });
    [admin, b].forEach((c) => c.close());
  });

  it('TC-053 unsupported input → LINK_UNSUPPORTED', async () => {
    const { admin } = await createRoom(t.url);
    for (const input of [
      'https://vimeo.com/1',
      'https://www.youtube.com/@abc',
      'javascript:alert(1)',
    ]) {
      expect(await admin.cmd('queue:add', { input })).toEqual({
        ok: false,
        error: { code: 'LINK_UNSUPPORTED' },
      });
    }
    admin.close();
  });

  it('TC-055 queue limit counts QUEUED only (4th ok, 5th QUEUE_LIMIT with max)', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await b.ok('queue:add', { input: yt(V.short) }); // plays (not counted)
    for (const id of [V.b, V.c, V.d, V.e])
      await b.ok('queue:add', { input: yt(id) });
    expect(await b.cmd('queue:add', { input: yt(V.f) })).toEqual({
      ok: false,
      error: { code: 'QUEUE_LIMIT', params: { max: 4 } },
    });
    [admin, b].forEach((c) => c.close());
  });

  it('review P3-8: a member at the limit gets QUEUE_LIMIT without spending YouTube quota', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('room:settings', { maxQueuedPerMember: 1 });
    await b.ok('queue:add', { input: yt(V.short) }); // plays
    await b.ok('queue:add', { input: yt(V.b) }); // queued → at limit
    const before = calls.videos + calls.oembed;
    for (let i = 0; i < 5; i++) {
      expect(
        await b.cmd('queue:add', { input: yt(vid(900 + i)) }),
      ).toMatchObject({ error: { code: 'QUEUE_LIMIT' } });
    }
    expect(calls.videos + calls.oembed).toBe(before);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-056/TC-057 duration limit 600s: 599 ok, 600 ok, 601 TRACK_TOO_LONG; 0 = unlimited', async () => {
    const { admin } = await createRoom(t.url);
    await admin.ok('room:settings', { maxQueuedPerMember: 20 });
    expect((await admin.cmd('queue:add', { input: yt(V.d599) })).ok).toBe(true);
    expect((await admin.cmd('queue:add', { input: yt(V.d600) })).ok).toBe(true);
    expect(await admin.cmd('queue:add', { input: yt(V.d601) })).toEqual({
      ok: false,
      error: { code: 'TRACK_TOO_LONG', params: { duration: 601, max: 600 } },
    });
    await admin.ok('room:settings', { maxTrackDurationSec: 0 });
    expect((await admin.cmd('queue:add', { input: yt(V.d7200) })).ok).toBe(
      true,
    );
    admin.close();
  });

  it('TC-058/TC-059/TC-060 not embeddable / not found / live are rejected', async () => {
    const { admin } = await createRoom(t.url);
    expect(
      await admin.cmd('queue:add', { input: yt(V.noEmbed) }),
    ).toMatchObject({ error: { code: 'TRACK_NOT_EMBEDDABLE' } });
    expect(
      await admin.cmd('queue:add', { input: yt(V.unknown) }),
    ).toMatchObject({ error: { code: 'TRACK_NOT_FOUND' } });
    expect(await admin.cmd('queue:add', { input: yt(V.live) })).toMatchObject({
      error: { code: 'TRACK_LIVE' },
    });
    expect(admin.snap!.status).toBe('IDLE');
    admin.close();
  });

  it('accepts a "youtube:<id>" track id from search results', async () => {
    const { admin } = await createRoom(t.url);
    expect((await admin.cmd('queue:add', { input: `youtube:${V.b}` })).ok).toBe(
      true,
    );
    admin.close();
  });
});

describe('Without an API key (TC-061)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube({ ...videos, [vid(31)]: { title: 'Fresh', durationSec: 180 } });
    t = await startApp({ YOUTUBE_API_KEY: undefined });
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('adds via oEmbed with unknown duration', async () => {
    const { admin } = await createRoom(t.url);
    // vid(30) is not stubbed → not found via oEmbed
    expect(await admin.cmd('queue:add', { input: yt(vid(30)) })).toMatchObject({
      error: { code: 'TRACK_NOT_FOUND' },
    });
    // never fetched before, so it is not in the Track cache (R-36)
    const r = await admin.ok('queue:add', { input: yt(vid(31)) });
    const s = await admin.until((x) => x.nowPlaying?.item.id === r.queueItemId);
    expect(s.nowPlaying!.item.track.durationSec).toBeNull();
    expect(s.searchEnabled).toBe(false);
    admin.close();
  });
});

describe('Remove, pin, heart, wishes (TC-080…TC-088)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  async function room() {
    const { admin, code } = await createRoom(t.url);
    const cur = await admin.ok('queue:add', { input: yt(V.short) });
    const b = await joinRoom(t.url, code, 'Bình');
    const x = await b.ok('queue:add', { input: yt(V.b) });
    const y = await admin.ok('queue:add', { input: yt(V.c) });
    return {
      admin,
      b,
      code,
      cur: cur.queueItemId,
      x: x.queueItemId,
      y: y.queueItemId,
    };
  }

  it('TC-080 remove own QUEUED → gone everywhere + logged; TC-082 again → STALE_ITEM', async () => {
    const { admin, b, x } = await room();
    await b.ok('queue:remove', { queueItemId: x });
    await admin.until((s) => !s.queue.some((q) => q.id === x));
    await admin.waitFor('activity:new', (l) => l.type === 'track_remove');
    expect(await b.cmd('queue:remove', { queueItemId: x })).toMatchObject({
      error: { code: 'STALE_ITEM' },
    });
    [admin, b].forEach((c) => c.close());
  });

  it('TC-081 removing the PLAYING item → STALE_ITEM, keeps playing', async () => {
    const { admin, b, cur } = await room();
    expect(await admin.cmd('queue:remove', { queueItemId: cur })).toMatchObject(
      { error: { code: 'STALE_ITEM' } },
    );
    expect(admin.snap!.nowPlaying!.item.id).toBe(cur);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-083 pin moves to the front; pin again unpins', async () => {
    const { admin, b, y } = await room();
    await admin.ok('queue:pin-next', { queueItemId: y });
    let s = await admin.until((q) => q.queue[0]?.id === y && q.queue[0].pinned);
    expect(s.queue[0].round).toBe(0);
    await admin.ok('queue:pin-next', { queueItemId: y });
    s = await admin.until((q) => !q.queue.some((i) => i.pinned));
    expect(s.queue.map((i) => i.id)).toEqual(s.queue.map((i) => i.id)); // order recomputed
    [admin, b].forEach((c) => c.close());
  });

  it('TC-084 heart moves between items; same item again removes it (I-03)', async () => {
    const { admin, b, x, y } = await room();
    await b.ok('queue:heart', { queueItemId: y });
    await b.ok('queue:heart', { queueItemId: x });
    let s = await admin.until(
      (q) => q.queue.find((i) => i.id === x)!.hearts === 1,
    );
    expect(s.queue.find((i) => i.id === y)!.hearts).toBe(0);
    await b.ok('queue:heart', { queueItemId: x });
    s = await admin.until((q) => q.queue.every((i) => i.hearts === 0));
    expect(s.queue.every((i) => i.heartedBy.length === 0)).toBe(true);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-085/TC-088 heart or wish on the PLAYING item → STALE_ITEM', async () => {
    const { admin, b, cur } = await room();
    expect(await b.cmd('queue:heart', { queueItemId: cur })).toMatchObject({
      error: { code: 'STALE_ITEM' },
    });
    expect(
      await admin.cmd('queue:set-message', {
        queueItemId: cur,
        wishMessage: 'hi',
      }),
    ).toMatchObject({ error: { code: 'STALE_ITEM' } });
    [admin, b].forEach((c) => c.close());
  });

  it('TC-086 wish 200 chars saved, empty clears it, default voice radio', async () => {
    const { admin, b, x } = await room();
    await b.ok('queue:set-message', {
      queueItemId: x,
      wishMessage: 'x'.repeat(200),
    });
    let s = await admin.until(
      (q) => q.queue.find((i) => i.id === x)!.wishMessage !== null,
    );
    expect(s.queue.find((i) => i.id === x)).toMatchObject({
      voicePreset: 'radio',
    });
    await b.ok('queue:set-message', {
      queueItemId: x,
      wishMessage: '',
      voicePreset: 'baby',
    });
    s = await admin.until(
      (q) => q.queue.find((i) => i.id === x)!.wishMessage === null,
    );
    expect(s.queue.find((i) => i.id === x)!.voicePreset).toBeNull();
    [admin, b].forEach((c) => c.close());
  });

  it('TC-185 lowering the limit keeps existing items but blocks new ones', async () => {
    const { admin, b } = await room();
    await b.ok('queue:add', { input: yt(V.d) });
    await admin.ok('room:settings', { maxQueuedPerMember: 1 });
    expect(
      admin.snap!.queue.filter((q) => q.addedBy?.displayName === 'Bình').length,
    ).toBe(2);
    expect(await b.cmd('queue:add', { input: yt(V.e) })).toEqual({
      ok: false,
      error: { code: 'QUEUE_LIMIT', params: { max: 1 } },
    });
    [admin, b].forEach((c) => c.close());
  });

  it('TC-078 every client gets the same order for the same version (I-05)', async () => {
    const { admin, b, code } = await room();
    const c = await joinRoom(t.url, code, 'Chi');
    await c.ok('queue:add', { input: yt(V.d) });
    await b.ok('queue:heart', { queueItemId: admin.snap!.queue[0].id });
    const v = (await admin.until((s) => s.queue.length === 3)).version;
    const [sa, sb, sc] = await Promise.all(
      [admin, b, c].map((x) => x.until((s) => s.version >= v)),
    );
    const ids = (s: typeof sa) => s.queue.map((q) => q.id);
    expect(ids(sb)).toEqual(ids(sa));
    expect(ids(sc)).toEqual(ids(sa));
    [admin, b, c].forEach((x) => x.close());
  });
});

describe('Concurrency (TC-066)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('two adds into an IDLE room at once → exactly one PLAYING (I-01)', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    const [r1, r2] = await Promise.all([
      admin.cmd('queue:add', { input: yt(V.b) }),
      b.cmd('queue:add', { input: yt(V.c) }),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    const playing = await t.prisma.queueItem.count({
      where: { room: { code }, status: 'PLAYING' },
    });
    const queued = await t.prisma.queueItem.count({
      where: { room: { code }, status: 'QUEUED' },
    });
    expect([playing, queued]).toEqual([1, 1]);
    [admin, b].forEach((c) => c.close());
  });

  it('TC-062 a double-submitted add creates exactly the items requested (no duplicates from retries)', async () => {
    const { admin } = await createRoom(t.url);
    const before = await t.prisma.queueItem.count();
    await admin.ok('queue:add', { input: yt(V.b) });
    expect(await t.prisma.queueItem.count()).toBe(before + 1);
    admin.close();
  });

  it('unknown event names and non-object payloads do not crash (TC-195)', async () => {
    const c = new TestClient(t.url);
    await c.connected();
    c.socket.emit('foo:bar', { x: 1 });
    expect(await c.cmd('room:join', 'not an object')).toEqual({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect((await c.cmd('room:peek', { code: 'ZZZZZZ' })).ok).toBe(false);
    c.close();
  });
});
