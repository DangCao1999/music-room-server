import { C2S, RoomSettingsSchema, DEFAULT_SETTINGS } from './schemas';
import { cleanLine, nameKey, normalizeQuery, normalizeRoomCode } from './text';
import { parseYouTubePlaylist, parseYouTubeVideo } from './youtube';

const ok = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  v: unknown,
) => schema.safeParse(v).success;

describe('contracts: room & identity inputs', () => {
  const create = C2S['room:create'];
  const base = { name: 'Dev tầng 3', displayName: 'An', adminPin: '1234' };

  it('TC-006 room name boundaries (blank / 1 / 50 / 51)', () => {
    expect(ok(create, { ...base, name: '   ' })).toBe(false);
    expect(ok(create, { ...base, name: 'A' })).toBe(true);
    expect(ok(create, { ...base, name: 'x'.repeat(50) })).toBe(true);
    expect(ok(create, { ...base, name: 'x'.repeat(51) })).toBe(false);
  });

  it('TC-007 PIN partitions (3/4/8/9 digits, letters, full-width digits)', () => {
    expect(ok(create, { ...base, adminPin: '123' })).toBe(false);
    expect(ok(create, { ...base, adminPin: '1234' })).toBe(true);
    expect(ok(create, { ...base, adminPin: '12345678' })).toBe(true);
    expect(ok(create, { ...base, adminPin: '123456789' })).toBe(false);
    expect(ok(create, { ...base, adminPin: '12a4' })).toBe(false);
    expect(ok(create, { ...base, adminPin: '１２３４' })).toBe(false);
  });

  it('TC-012 room code is trimmed and upper-cased', () => {
    const r = C2S['room:join'].safeParse({
      code: ' k7m2qx ',
      displayName: 'An',
    });
    expect(r.success && r.data.code).toBe('K7M2QX');
    expect(normalizeRoomCode('k7 m2qx')).toBe('K7M2QX');
    expect(ok(C2S['room:join'], { code: 'K7M2Q0', displayName: 'An' })).toBe(
      false,
    );
    expect(ok(C2S['room:join'], { code: 'K7M2Q', displayName: 'An' })).toBe(
      false,
    );
  });

  it('TC-018 display name boundaries (blank / 1 / 30 / 31)', () => {
    const join = C2S['room:join'];
    const code = 'K7M2QX';
    expect(ok(join, { code, displayName: '' })).toBe(false);
    expect(ok(join, { code, displayName: 'A' })).toBe(true);
    expect(ok(join, { code, displayName: 'a'.repeat(30) })).toBe(true);
    expect(ok(join, { code, displayName: 'a'.repeat(31) })).toBe(false);
  });

  it('TC-019 strips control and invisible characters, keeps markup as text', () => {
    expect(cleanLine('An\u0000\u200B')).toBe('An');
    expect(cleanLine('  <script>alert(1)</script> ')).toBe(
      '<script>alert(1)</script>',
    );
  });

  it('TC-017 name key: case-insensitive, NFC, keeps diacritics', () => {
    expect(nameKey('Đức')).toBe(nameKey('đức'.normalize('NFD')));
    expect(nameKey(' AN ')).toBe(nameKey('an'));
    expect(nameKey('Duc')).not.toBe(nameKey('Đức'));
  });

  it('TC-034 rejects unknown keys such as a spoofed requesterId', () => {
    expect(
      ok(C2S['permission:set'], {
        memberId: 'm1',
        canDj: true,
        requesterId: 'admin',
      }),
    ).toBe(false);
    expect(ok(C2S['permission:set'], { memberId: 'm1' })).toBe(false);
    expect(ok(C2S['permission:set'], { memberId: 'm1', canDj: true })).toBe(
      true,
    );
  });
});

describe('contracts: queue, search, chat inputs', () => {
  it('TC-054 input length 2048 ok, 2049 rejected', () => {
    expect(ok(C2S['queue:add'], { input: 'a'.repeat(2048) })).toBe(true);
    expect(ok(C2S['queue:add'], { input: 'a'.repeat(2049) })).toBe(false);
  });

  it('TC-086/087 wish 200 ok, 201 rejected, empty allowed, invalid voice rejected', () => {
    const s = C2S['queue:set-message'];
    expect(ok(s, { queueItemId: 'q', wishMessage: 'x'.repeat(200) })).toBe(
      true,
    );
    expect(ok(s, { queueItemId: 'q', wishMessage: 'x'.repeat(201) })).toBe(
      false,
    );
    expect(ok(s, { queueItemId: 'q', wishMessage: '' })).toBe(true);
    expect(
      ok(s, { queueItemId: 'q', wishMessage: 'hi', voicePreset: 'robot' }),
    ).toBe(false);
  });

  it('TC-144 query 0 / 1 / 100 / 101', () => {
    const s = C2S['search:query'];
    expect(ok(s, { q: '  ' })).toBe(false);
    expect(ok(s, { q: 'a' })).toBe(true);
    expect(ok(s, { q: 'a'.repeat(100) })).toBe(true);
    expect(ok(s, { q: 'a'.repeat(101) })).toBe(false);
  });

  it('TC-161 chat 0 / 500 / 501', () => {
    const s = C2S['chat:send'];
    expect(ok(s, { content: '' })).toBe(false);
    expect(ok(s, { content: 'x'.repeat(500) })).toBe(true);
    expect(ok(s, { content: 'x'.repeat(501) })).toBe(false);
  });

  it('TC-165 reaction allow-list', () => {
    expect(ok(C2S['room:reaction'], { emoji: '🔥' })).toBe(true);
    expect(ok(C2S['room:reaction'], { emoji: '💩' })).toBe(false);
  });

  it('TC-104 player error codes allow-list', () => {
    const s = C2S['player:report'];
    expect(ok(s, { queueItemId: 'q', event: 'error', errorCode: 150 })).toBe(
      true,
    );
    expect(ok(s, { queueItemId: 'q', event: 'error', errorCode: 2 })).toBe(
      true,
    );
    expect(ok(s, { queueItemId: 'q', event: 'error', errorCode: 999 })).toBe(
      false,
    );
  });

  it('TC-102 seek bounds at the schema level (negative rejected)', () => {
    const s = C2S['playback:control'];
    expect(ok(s, { action: 'seek', queueItemId: 'q', positionSec: -1 })).toBe(
      false,
    );
    expect(ok(s, { action: 'seek', queueItemId: 'q', positionSec: 0 })).toBe(
      true,
    );
  });

  it('TC-143 query normalization removes diacritics and collapses spaces', () => {
    expect(normalizeQuery('Sơn Tùng')).toBe('son tung');
    expect(normalizeQuery('  son   TUNG ')).toBe('son tung');
    expect(normalizeQuery('Đen Vâu')).toBe('den vau');
  });
});

describe('contracts: room settings (R-47)', () => {
  const s = C2S['room:settings'];
  it('defaults are valid', () => {
    expect(RoomSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
  it('TC-181 skipThreshold 0.09 / 0.1 / 1 / 1.01', () => {
    expect(ok(s, { skipThreshold: 0.09 })).toBe(false);
    expect(ok(s, { skipThreshold: 0.1 })).toBe(true);
    expect(ok(s, { skipThreshold: 1 })).toBe(true);
    expect(ok(s, { skipThreshold: 1.01 })).toBe(false);
  });
  it('TC-182 maxQueuedPerMember 0 / 1 / 20 / 21', () => {
    expect(ok(s, { maxQueuedPerMember: 0 })).toBe(false);
    expect(ok(s, { maxQueuedPerMember: 1 })).toBe(true);
    expect(ok(s, { maxQueuedPerMember: 20 })).toBe(true);
    expect(ok(s, { maxQueuedPerMember: 21 })).toBe(false);
  });
  it('TC-183 maxTrackDurationSec 0 / 59 / 60 / 7200 / 7201 / 90.5', () => {
    expect(ok(s, { maxTrackDurationSec: 0 })).toBe(true);
    expect(ok(s, { maxTrackDurationSec: 59 })).toBe(false);
    expect(ok(s, { maxTrackDurationSec: 60 })).toBe(true);
    expect(ok(s, { maxTrackDurationSec: 7200 })).toBe(true);
    expect(ok(s, { maxTrackDurationSec: 7201 })).toBe(false);
    expect(ok(s, { maxTrackDurationSec: 90.5 })).toBe(false);
  });
  it('TC-184 fallback playlist must be a playlist link or null', () => {
    expect(
      ok(s, {
        fallbackPlaylistUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).toBe(false);
    expect(
      ok(s, {
        fallbackPlaylistUrl:
          'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
      }),
    ).toBe(true);
    expect(ok(s, { fallbackPlaylistUrl: null })).toBe(true);
  });
  it('rejects empty and unknown keys', () => {
    expect(ok(s, {})).toBe(false);
    expect(ok(s, { foo: 1 })).toBe(false);
  });
});

describe('contracts: YouTube link parsing (R-15)', () => {
  const ID = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtube.com/shorts/${ID}`,
    `https://music.youtube.com/watch?v=${ID}&feature=share`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123456789012`,
    `https://youtu.be/${ID}?si=abcDEF`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `youtube.com/watch?v=${ID}`,
    ID,
  ])('TC-052 parses %s', (input) => {
    expect(parseYouTubeVideo(input)).toEqual({ videoId: ID });
  });

  it.each([
    'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    'https://www.youtube.com/@channel',
    'https://vimeo.com/1',
    'dQw4w9WgXc',
    'javascript:alert(1)',
    'hello_world',
    `https://evil.com/watch?v=${ID}`,
    `ftp://youtube.com/watch?v=${ID}`,
  ])('TC-053 rejects %s', (input) => {
    expect(parseYouTubeVideo(input)).toBeNull();
  });

  it('parses playlist ids', () => {
    expect(
      parseYouTubePlaylist(
        'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
      ),
    ).toEqual({ playlistId: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' });
  });
});
