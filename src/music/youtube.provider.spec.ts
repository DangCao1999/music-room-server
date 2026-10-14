import nock from 'nock';
import { AppError } from '../common/app-error';
import type { Env } from '../config/env';
import { YouTubeProvider } from './youtube.provider';

const KEY = 'test-key';
const ID = 'dQw4w9WgXcQ';
const env = (key?: string) => ({ YOUTUBE_API_KEY: key }) as unknown as Env;

const video = (over: Record<string, unknown> = {}) => ({
  id: ID,
  snippet: {
    title: 'Never Gonna Give You Up',
    channelTitle: 'Rick Astley',
    liveBroadcastContent: 'none',
    thumbnails: { medium: { url: 'https://i.ytimg.com/vi/x/mq.jpg' } },
  },
  contentDetails: { duration: 'PT3M33S' },
  status: { embeddable: true },
  ...over,
});

const aborted = () =>
  Object.assign(new Error('aborted'), { name: 'AbortError' });

const api = () =>
  nock('https://www.googleapis.com').get(/\/youtube\/v3\/videos/);
const oembed = () => nock('https://www.youtube.com').get(/\/oembed/);
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('YouTubeProvider.getTrack', () => {
  it('maps Data API metadata (duration, channel, thumbnail)', async () => {
    api().reply(200, { items: [video()] });
    const t = await new YouTubeProvider(env(KEY)).getTrack(ID);
    expect(t).toMatchObject({
      title: 'Never Gonna Give You Up',
      channel: 'Rick Astley',
      durationSec: 213,
      embeddable: true,
      live: false,
    });
  });

  it('TC-059 empty items → TRACK_NOT_FOUND', async () => {
    api().reply(200, { items: [] });
    expect(await code(new YouTubeProvider(env(KEY)).getTrack(ID))).toBe(
      'TRACK_NOT_FOUND',
    );
  });

  it('TC-060 live / upcoming are flagged', async () => {
    api().reply(200, {
      items: [
        video({
          snippet: { title: 'x', liveBroadcastContent: 'live' },
          contentDetails: { duration: 'P0D' },
        }),
      ],
    });
    const t = await new YouTubeProvider(env(KEY)).getTrack(ID);
    expect(t.live).toBe(true);
    expect(t.durationSec).toBeNull();
  });

  it('TC-058 embeddable=false is reported', async () => {
    api().reply(200, { items: [video({ status: { embeddable: false } })] });
    expect((await new YouTubeProvider(env(KEY)).getTrack(ID)).embeddable).toBe(
      false,
    );
  });

  it('TC-061 no key → oEmbed with unknown duration', async () => {
    oembed().reply(200, {
      title: 'Song',
      author_name: 'Ch',
      thumbnail_url: 'u',
    });
    const t = await new YouTubeProvider(env()).getTrack(ID);
    expect(t).toMatchObject({
      title: 'Song',
      channel: 'Ch',
      durationSec: null,
    });
  });

  it('TC-065 quota exceeded → oEmbed, and later calls skip the API', async () => {
    api().reply(403, { error: { errors: [{ reason: 'quotaExceeded' }] } });
    oembed().times(2).reply(200, { title: 'Song' });
    const p = new YouTubeProvider(env(KEY));
    expect((await p.getTrack(ID)).durationSec).toBeNull();
    await p.getTrack(ID); // no API interceptor left: would throw if called
    expect(nock.isDone()).toBe(true);
  });

  it('TC-059 oEmbed 404 → TRACK_NOT_FOUND, 401 → TRACK_NOT_EMBEDDABLE', async () => {
    oembed().reply(404, 'Not Found');
    expect(await code(new YouTubeProvider(env()).getTrack(ID))).toBe(
      'TRACK_NOT_FOUND',
    );
    oembed().reply(401, 'Unauthorized');
    expect(await code(new YouTubeProvider(env()).getTrack(ID))).toBe(
      'TRACK_NOT_EMBEDDABLE',
    );
  });

  it('TC-063 first attempt times out, retry succeeds', async () => {
    const p = new YouTubeProvider(env(KEY));
    let calls = 0;
    p.fetchImpl = (() => {
      calls++;
      if (calls === 1) return Promise.reject(aborted());
      return Promise.resolve(
        new Response(JSON.stringify({ items: [video()] }), { status: 200 }),
      );
    }) as typeof fetch;
    expect((await p.getTrack(ID)).durationSec).toBe(213);
    expect(calls).toBe(2);
  });

  it('TC-064 API 503 twice and oEmbed failing → INTERNAL', async () => {
    api().times(2).reply(503, {});
    oembed().times(2).reply(503, '');
    expect(await code(new YouTubeProvider(env(KEY)).getTrack(ID))).toBe(
      'INTERNAL',
    );
  });

  it('does not retry 4xx', async () => {
    oembed().once().reply(404, '');
    expect(await code(new YouTubeProvider(env()).getTrack(ID))).toBe(
      'TRACK_NOT_FOUND',
    );
    expect(nock.isDone()).toBe(true);
  });
});

describe('YouTubeProvider.search', () => {
  const searchApi = () =>
    nock('https://www.googleapis.com').get(/\/youtube\/v3\/search/);

  it('TC-141 no key → SEARCH_UNAVAILABLE', async () => {
    expect(await code(new YouTubeProvider(env()).search('x'))).toBe(
      'SEARCH_UNAVAILABLE',
    );
  });

  it('TC-140/150 returns embeddable non-live videos in API order', async () => {
    searchApi().reply(200, {
      items: [
        { id: { videoId: 'aaaaaaaaaaA' } },
        { id: { videoId: 'bbbbbbbbbbB' } },
        { id: { videoId: 'cccccccccC1' } },
      ],
    });
    api().reply(200, {
      items: [
        video({ id: 'bbbbbbbbbbB' }),
        video({ id: 'aaaaaaaaaaA', status: { embeddable: false } }),
        video({
          id: 'cccccccccC1',
          snippet: { title: 'live', liveBroadcastContent: 'live' },
        }),
      ],
    });
    const r = await new YouTubeProvider(env(KEY)).search('lac troi');
    expect(r.map((t) => t.externalId)).toEqual(['bbbbbbbbbbB']);
  });

  it('TC-142 quota exceeded → QUOTA_EXCEEDED, then stays exceeded', async () => {
    searchApi().reply(403, {
      error: { errors: [{ reason: 'quotaExceeded' }] },
    });
    const p = new YouTubeProvider(env(KEY));
    expect(await code(p.search('x'))).toBe('QUOTA_EXCEEDED');
    expect(await code(p.search('y'))).toBe('QUOTA_EXCEEDED');
  });

  it('TC-147 invalid key → SEARCH_UNAVAILABLE and link adds use oEmbed', async () => {
    searchApi().reply(400, {
      error: {
        message: 'API key not valid. Please pass a valid API key.',
        errors: [{ reason: 'badRequest' }],
      },
    });
    const p = new YouTubeProvider(env(KEY));
    expect(await code(p.search('x'))).toBe('SEARCH_UNAVAILABLE');
    expect(p.searchEnabled).toBe(false);
    oembed().reply(200, { title: 'Song' });
    expect((await p.getTrack(ID)).title).toBe('Song');
  });

  it('TC-146 timeouts twice → INTERNAL', async () => {
    const p = new YouTubeProvider(env(KEY));
    p.fetchImpl = (() => Promise.reject(aborted())) as typeof fetch;
    expect(await code(p.search('x'))).toBe('INTERNAL');
  });
});
