import nock from 'nock';
import type { CommandName } from '../../src/contracts';
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

const videos = Object.fromEntries(
  // own id range (1000+) so Track rows cached by other suites never collide
  Array.from({ length: 400 }, (_, i) => [vid(1000 + i), { durationSec: 200 }]),
);

let n = 1000;
const nextLink = () => link(++n);

type Role = 'guest' | 'member' | 'ctrl' | 'dj' | 'admin' | 'device' | 'left';
const ROLES: Role[] = [
  'guest',
  'member',
  'ctrl',
  'dj',
  'admin',
  'device',
  'left',
];

interface Fixture {
  code: string;
  c: Record<Role, TestClient>;
  items: Record<'admin' | 'member' | 'ctrl' | 'dj', string>;
  current: string;
  all: TestClient[];
}

/** One room with every role from the PM table, a current track and one queued track per member. */
async function fixture(t: TestApp): Promise<Fixture> {
  const { admin, code } = await createRoom(t.url);
  const first = await admin.ok('queue:add', { input: nextLink() });
  const member = await joinRoom(t.url, code, 'Member');
  const ctrl = await joinRoom(t.url, code, 'Ctrl');
  const dj = await joinRoom(t.url, code, 'Dj');
  const left = await joinRoom(t.url, code, 'Left');
  await admin.ok('permission:set', {
    memberId: ctrl.memberId!,
    canControl: true,
  });
  await admin.ok('permission:set', { memberId: dj.memberId!, canDj: true });
  await admin.ok('room:settings', { skipThreshold: 1, maxQueuedPerMember: 20 });
  const device = new TestClient(t.url);
  await device.ok('host:register', { code, pin: '1234' });
  await device.ok('player:claim');
  const items = {
    admin: (await admin.ok('queue:add', { input: nextLink() })).queueItemId,
    member: (await member.ok('queue:add', { input: nextLink() })).queueItemId,
    ctrl: (await ctrl.ok('queue:add', { input: nextLink() })).queueItemId,
    dj: (await dj.ok('queue:add', { input: nextLink() })).queueItemId,
  };
  await left.ok('room:leave');
  const guest = new TestClient(t.url);
  await guest.connected();
  const c = { guest, member, ctrl, dj, admin, device, left };
  return { code, c, items, current: first.queueItemId, all: Object.values(c) };
}

type Expect = 'ok' | 'F' | 'U';
const OUTCOME = (r: { ok: boolean; error?: { code: string } }): string =>
  r.ok
    ? 'ok'
    : r.error?.code === 'FORBIDDEN'
      ? 'F'
      : r.error?.code === 'UNAUTHENTICATED'
        ? 'U'
        : r.error!.code;

interface Row {
  id: string;
  cmd: CommandName;
  payload: (f: Fixture, role: Role) => Record<string, unknown>;
  expect: Record<Role, Expect>;
}

const other = (role: Role): 'admin' | 'member' | 'ctrl' | 'dj' =>
  role === 'member' ? 'ctrl' : 'member';
const own = (role: Role): 'admin' | 'member' | 'ctrl' | 'dj' =>
  role === 'admin' || role === 'member' || role === 'ctrl' || role === 'dj'
    ? role
    : 'member';

const E = (
  g: Expect,
  m: Expect,
  c: Expect,
  d: Expect,
  a: Expect,
  dev: Expect,
  l: Expect,
) =>
  ({
    guest: g,
    member: m,
    ctrl: c,
    dj: d,
    admin: a,
    device: dev,
    left: l,
  }) as Record<Role, Expect>;

const ROWS: Row[] = [
  {
    id: 'PM-01',
    cmd: 'queue:add',
    payload: () => ({ input: nextLink() }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-02',
    cmd: 'queue:remove',
    payload: (f, r) => ({ queueItemId: f.items[own(r)] }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-03',
    cmd: 'queue:remove',
    payload: (f, r) => ({ queueItemId: f.items[other(r)] }),
    expect: E('U', 'F', 'F', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-04',
    cmd: 'queue:pin-next',
    payload: (f) => ({ queueItemId: f.items.dj }),
    expect: E('U', 'F', 'ok', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-05',
    cmd: 'queue:heart',
    payload: (f) => ({ queueItemId: f.items.admin }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-06a',
    cmd: 'queue:set-message',
    payload: (f, r) => ({ queueItemId: f.items[own(r)], wishMessage: 'hi' }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-06b',
    cmd: 'queue:set-message',
    payload: (f, r) => ({ queueItemId: f.items[other(r)], wishMessage: 'hi' }),
    expect: E('U', 'F', 'F', 'F', 'F', 'F', 'U'),
  },
  {
    id: 'PM-07',
    cmd: 'queue:vote-skip',
    payload: (f) => ({ queueItemId: f.current }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-08',
    cmd: 'playback:control',
    payload: (f) => ({ action: 'pause', queueItemId: f.current }),
    expect: E('U', 'F', 'ok', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-09',
    cmd: 'player:report',
    payload: (f) => ({
      queueItemId: f.current,
      event: 'progress',
      positionSec: 1,
    }),
    expect: E('U', 'F', 'F', 'F', 'F', 'ok', 'U'),
  },
  {
    id: 'PM-10',
    cmd: 'permission:set',
    payload: (f) => ({ memberId: f.c.member.memberId, canDj: true }),
    expect: E('U', 'F', 'F', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-11',
    cmd: 'member:kick',
    payload: (f, r) => ({
      memberId: r === 'admin' ? f.c.dj.memberId : f.c.member.memberId,
    }),
    expect: E('U', 'F', 'F', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-12',
    cmd: 'room:settings',
    payload: () => ({ allowGuestDj: true }),
    expect: E('U', 'F', 'F', 'F', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-13',
    cmd: 'chat:send',
    payload: () => ({ content: 'hello' }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-14',
    cmd: 'room:reaction',
    payload: () => ({ emoji: '🔥' }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-15',
    cmd: 'dj:trigger',
    payload: () => ({ soundType: 'airhorn' }),
    expect: E('U', 'F', 'F', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-16',
    cmd: 'search:query',
    payload: () => ({ q: 'lac troi' }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-17',
    cmd: 'admin:claim',
    payload: () => ({ pin: '1234' }),
    expect: E('U', 'ok', 'ok', 'ok', 'ok', 'F', 'U'),
  },
  {
    id: 'PM-18',
    cmd: 'room:peek',
    payload: (f) => ({ code: f.code }),
    expect: E('ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'),
  },
];

describe('Permission matrix PM-01…PM-18 (7 roles × 18 actions)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it.each(ROWS.map((r) => [r.id, r] as const))('%s', async (_id, row) => {
    const f = await fixture(t);
    const got: Record<string, string> = {};
    for (const role of ROLES) {
      const r = await f.c[role].cmd(row.cmd, row.payload(f, role));
      got[role] = OUTCOME(r as never);
    }
    expect(got).toEqual(row.expect);
    f.all.forEach((c) => c.close());
  });
});

describe('Admin, kick, permission changes (TC-030…TC-042)', () => {
  let t: TestApp;
  beforeAll(async () => {
    stubYouTube(videos);
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-030…TC-032 PIN claim, countdown, lockout even for the right PIN', async () => {
    const { admin, code } = await createRoom(t.url, { pin: '1234' });
    const b = await joinRoom(t.url, code, 'Bình');
    for (const remaining of [4, 3, 2, 1]) {
      expect(await b.cmd('admin:claim', { pin: '0000' })).toEqual({
        ok: false,
        error: { code: 'PIN_INVALID', params: { remaining } },
      });
    }
    expect(await b.cmd('admin:claim', { pin: '0000' })).toEqual({
      ok: false,
      error: { code: 'PIN_LOCKED', params: { minutes: 15 } },
    });
    expect((await b.cmd('admin:claim', { pin: '1234' })).ok).toBe(false);
    // a different IP is not locked
    const c = new TestClient(t.url, { token: b.token! });
    await c.waitFor('session:ready');
    expect((await c.cmd('admin:claim', { pin: '1234' })).ok).toBe(true);
    const s = await admin.until((x) =>
      x.members.some((m) => m.id === b.memberId && m.role === 'ADMIN'),
    );
    expect(s.members.find((m) => m.id === b.memberId)!.canControl).toBe(true);
    [admin, b, c].forEach((x) => x.close());
  });

  it('TC-034 a spoofed requesterId is rejected as VALIDATION', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    const r = await b.cmd('permission:set', {
      memberId: b.memberId!,
      canDj: true,
      requesterId: admin.memberId,
    });
    expect(r).toEqual({ ok: false, error: { code: 'VALIDATION' } });
    [admin, b].forEach((x) => x.close());
  });

  it('TC-035 kick: target is told, queued tracks removed, hearts/votes dropped, token dead', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('queue:add', { input: nextLink() });
    const b = await joinRoom(t.url, code, 'Bình');
    const c = await joinRoom(t.url, code, 'Chi');
    const b1 = await b.ok('queue:add', { input: nextLink() });
    await b.ok('queue:add', { input: nextLink() });
    const c1 = await c.ok('queue:add', { input: nextLink() });
    await b.ok('queue:heart', { queueItemId: c1.queueItemId });
    await admin.ok('member:kick', { memberId: b.memberId! });
    expect(await b.waitFor('session:revoked')).toEqual({ reason: 'kicked' });
    const s = await admin.until(
      (x) => !x.members.some((m) => m.id === b.memberId),
    );
    expect(s.queue.map((q) => q.id)).not.toContain(b1.queueItemId);
    expect(s.queue.find((q) => q.id === c1.queueItemId)!.hearts).toBe(0);
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.type === 'member_kick',
    );
    expect(log.message).toBe('đã mời Bình ra khỏi phòng');
    const again = new TestClient(t.url, { token: b.token! });
    expect(await again.waitFor('session:revoked')).toEqual({
      reason: 'invalid',
    });
    // TC-041 can come back as a new member with the same name
    const back = await joinRoom(t.url, code, 'Bình');
    expect(back.memberId).not.toBe(b.memberId);
    [admin, b, c, again, back].forEach((x) => x.close());
  });

  it('TC-036/TC-037 admin cannot kick/demote self; device cannot become admin', async () => {
    const { admin, code } = await createRoom(t.url);
    expect(
      await admin.cmd('member:kick', { memberId: admin.memberId! }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await admin.cmd('permission:set', {
        memberId: admin.memberId!,
        role: 'USER',
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const device = new TestClient(t.url);
    await device.ok('host:register', { code, pin: '1234' });
    expect(
      await admin.cmd('permission:set', {
        memberId: device.memberId!,
        role: 'ADMIN',
      }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    [admin, device].forEach((x) => x.close());
  });

  it('TC-039 permission revoked mid-way: stale "Bỏ qua ngay" is FORBIDDEN', async () => {
    const { admin, code } = await createRoom(t.url);
    const cur = await admin.ok('queue:add', { input: nextLink() });
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('permission:set', {
      memberId: b.memberId!,
      canControl: true,
    });
    await admin.ok('permission:set', {
      memberId: b.memberId!,
      canControl: false,
    });
    expect(
      await b.cmd('playback:control', {
        action: 'skip',
        queueItemId: cur.queueItemId,
      }),
    ).toEqual({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(admin.snap!.nowPlaying!.item.id).toBe(cur.queueItemId);
    [admin, b].forEach((x) => x.close());
  });

  it('TC-040 demoted admin cannot save settings', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('permission:set', { memberId: b.memberId!, role: 'ADMIN' });
    await admin.ok('permission:set', { memberId: b.memberId!, role: 'USER' });
    expect(
      await b.cmd('room:settings', { maxQueuedPerMember: 2 }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    [admin, b].forEach((x) => x.close());
  });

  it('TC-042 grants show up for everyone and are logged', async () => {
    const { admin, code } = await createRoom(t.url);
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('permission:set', {
      memberId: b.memberId!,
      canControl: true,
      canDj: true,
    });
    const s = await b.until((x) =>
      x.members.some((m) => m.id === b.memberId && m.canControl && m.canDj),
    );
    expect(s).toBeDefined();
    const msgs = new Set<string>();
    await admin.waitFor('activity:new', (l) => {
      msgs.add(l.message);
      return (
        msgs.has('đã cấp quyền điều khiển cho Bình') &&
        msgs.has('đã cấp quyền DJ cho Bình')
      );
    });
    [admin, b].forEach((x) => x.close());
  });

  it('TC-038 granting canPlay moves it (R-14) and revokes the old player', async () => {
    const { admin, code } = await createRoom(t.url);
    await admin.ok('player:claim');
    const b = await joinRoom(t.url, code, 'Bình');
    await admin.ok('permission:set', { memberId: b.memberId!, canPlay: true });
    expect(await admin.waitFor('player:revoked')).toEqual({
      reason: 'permission',
    });
    const s = await admin.until(
      (x) =>
        x.members.filter((m) => m.canPlay).length === 1 &&
        x.members.find((m) => m.canPlay)!.id === b.memberId,
    );
    expect(s.members.find((m) => m.id === admin.memberId)!.canPlay).toBe(false);
    // review P3-11c: the old holder is no longer reported as the (offline) player
    expect(s.player.memberId).not.toBe(admin.memberId);
    [admin, b].forEach((x) => x.close());
  });
});
