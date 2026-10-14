import nock from 'nock';
import {
  createRoom,
  joinRoom,
  startApp,
  type TestApp,
  TestClient,
} from './harness';

describe('Rooms & identity (TC-001…TC-026)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
    nock.cleanAll();
  });

  it('TC-001 create room → admin with canPlay, code matches alphabet, log "đã tạo phòng"', async () => {
    const { admin, code } = await createRoom(t.url, { displayName: 'An' });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const me = admin.snap!.members.find((m) => m.id === admin.memberId)!;
    expect(me).toMatchObject({
      displayName: 'An',
      role: 'ADMIN',
      canPlay: true,
      online: true,
    });
    const logs = await admin.waitFor('activity:history');
    expect(logs.map((l) => l.message)).toContain('đã tạo phòng');
    admin.close();
  });

  it('TC-011 join by code → visible to others with activity "đã vào phòng"', async () => {
    const { admin, code } = await createRoom(t.url);
    const binh = await joinRoom(t.url, code, 'Bình');
    await admin.until((s) =>
      s.members.some((m) => m.displayName === 'Bình' && m.online),
    );
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.displayName === 'Bình',
    );
    expect(log.message).toBe('đã vào phòng');
    admin.close();
    binh.close();
  });

  it('TC-012 lower-case code with spaces joins the same room', async () => {
    const { admin, code } = await createRoom(t.url);
    const c = new TestClient(t.url);
    const r = await c.cmd('room:join', {
      code: ` ${code.toLowerCase()} `,
      displayName: 'Chi',
    });
    expect(r.ok).toBe(true);
    admin.close();
    c.close();
  });

  it('TC-013 unknown code → ROOM_NOT_FOUND', async () => {
    const c = new TestClient(t.url);
    const r = await c.cmd('room:join', { code: 'ZZZZZZ', displayName: 'X' });
    expect(r).toEqual({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
    c.close();
  });

  it('TC-016/TC-017 duplicate names (case, NFD) → NAME_TAKEN; "Duc" ≠ "Đức" allowed', async () => {
    const { admin, code } = await createRoom(t.url, { displayName: 'Đức' });
    const a = new TestClient(t.url);
    expect(
      await a.cmd('room:join', { code, displayName: 'đức'.normalize('NFD') }),
    ).toEqual({
      ok: false,
      error: { code: 'NAME_TAKEN' },
    });
    expect(
      await a.cmd('room:join', { code, displayName: ' ĐỨC ' }),
    ).toMatchObject({ ok: false });
    expect((await a.cmd('room:join', { code, displayName: 'Duc' })).ok).toBe(
      true,
    );
    admin.close();
    a.close();
  });

  it('TC-020 reconnect with token keeps identity, no new member', async () => {
    const { admin, code } = await createRoom(t.url);
    const binh = await joinRoom(t.url, code, 'Bình');
    const before = await t.prisma.member.count({ where: { room: { code } } });
    binh.close();
    const again = new TestClient(t.url, { token: binh.token! });
    await again.waitFor('session:ready');
    expect(again.memberId).toBe(binh.memberId);
    expect(await t.prisma.member.count({ where: { room: { code } } })).toBe(
      before,
    );
    admin.close();
    again.close();
  });

  it('TC-021 forged / garbage token → session:revoked invalid, then UNAUTHENTICATED', async () => {
    const c = new TestClient(t.url, { token: 'a.b.c' });
    expect(await c.waitFor('session:revoked')).toEqual({ reason: 'invalid' });
    expect(await c.cmd('chat:send', { content: 'hi' })).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    c.close();
  });

  it('TC-023 member stays online while one tab is open; offline but listed after all close', async () => {
    const { admin, code } = await createRoom(t.url);
    const tab1 = await joinRoom(t.url, code, 'Bình');
    const tab2 = new TestClient(t.url, { token: tab1.token! });
    await tab2.waitFor('session:ready');
    tab1.close();
    await new Promise((r) => setTimeout(r, 300));
    expect(
      admin.snap!.members.find((m) => m.id === tab2.memberId)!.online,
    ).toBe(true);
    tab2.close();
    const s = await admin.until((x) =>
      x.members.some((m) => m.id === tab2.memberId && !m.online),
    );
    expect(s.members.find((m) => m.id === tab2.memberId)).toBeDefined();
    admin.close();
  });

  it('TC-024/TC-025 leave: token dies, name freed, log "đã rời phòng"', async () => {
    const { admin, code } = await createRoom(t.url);
    const binh = await joinRoom(t.url, code, 'Bình');
    const token = binh.token!;
    await binh.ok('room:leave');
    await admin.until((s) => !s.members.some((m) => m.displayName === 'Bình'));
    const log = await admin.waitFor(
      'activity:new',
      (l) => l.message === 'đã rời phòng',
    );
    expect(log.displayName).toBe('Bình');
    const stale = new TestClient(t.url, { token });
    expect(await stale.waitFor('session:revoked')).toEqual({
      reason: 'invalid',
    });
    const again = await joinRoom(t.url, code, 'Bình');
    expect(again.memberId).not.toBe(binh.memberId);
    for (const c of [admin, binh, stale, again]) c.close();
  });

  it('TC-026 room survives being empty', async () => {
    const { admin, code } = await createRoom(t.url);
    admin.close();
    await new Promise((r) => setTimeout(r, 300));
    const c = new TestClient(t.url);
    expect((await c.cmd('room:peek', { code })).ok).toBe(true);
    c.close();
  });

  it('room:peek returns name and counts', async () => {
    const { admin, code } = await createRoom(t.url);
    const c = new TestClient(t.url);
    const r = await c.cmd('room:peek', { code });
    expect(r).toMatchObject({
      ok: true,
      data: { memberCount: 1, onlineCount: 1 },
    });
    admin.close();
    c.close();
  });
});

describe('Setup password (TC-002…TC-005)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp({ SETUP_PASSWORD: 's3cret' });
  });
  afterAll(() => t.close());

  const payload = { name: 'Dev', displayName: 'An', adminPin: '1234' };

  it('TC-002 correct password creates the room', async () => {
    const c = new TestClient(t.url);
    expect(
      (await c.cmd('room:create', { ...payload, setupPassword: 's3cret' })).ok,
    ).toBe(true);
    c.close();
  });

  it('TC-003 wrong / missing password → SETUP_PASSWORD_INVALID and no room created', async () => {
    const before = await t.prisma.room.count();
    const c = new TestClient(t.url);
    expect(
      await c.cmd('room:create', { ...payload, setupPassword: 'sai' }),
    ).toEqual({
      ok: false,
      error: { code: 'SETUP_PASSWORD_INVALID' },
    });
    expect((await c.cmd('room:create', payload)).ok).toBe(false);
    expect(await t.prisma.room.count()).toBe(before);
    c.close();
  });

  it('TC-190 health reports setupRequired', async () => {
    const res = await fetch(`${t.url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      db: 'up',
      setupRequired: true,
    });
  });
});

describe('No setup password (TC-005)', () => {
  it('ignores a supplied setupPassword', async () => {
    const t = await startApp();
    const c = new TestClient(t.url);
    const r = await c.cmd('room:create', {
      name: 'Dev',
      displayName: 'An',
      adminPin: '1234',
      setupPassword: 'x',
    });
    expect(r.ok).toBe(true);
    c.close();
    await t.close();
  });
});
