import { AppError } from '../common/app-error';
import { SEARCH_TTL_MS, SearchService } from './search.service';

function make(cacheAgeMs: number | null) {
  const track = {
    id: 'youtube:Abcdefghijk',
    externalId: 'Abcdefghijk',
    title: 'T',
    channel: null,
    durationSec: 60,
    thumbnailUrl: null,
    provider: 'youtube',
    embeddable: true,
    fetchedAt: new Date(),
  };
  const prisma = {
    searchCache: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          cacheAgeMs === null
            ? null
            : {
                key: 'k',
                trackIds: [track.id],
                createdAt: new Date(Date.now() - cacheAgeMs),
              },
        ),
      ),
      upsert: jest.fn(() => Promise.resolve(undefined)),
    },
    track: { findMany: jest.fn(() => Promise.resolve([track])) },
  };
  const youtube = {
    searchEnabled: true,
    search: jest.fn(() =>
      Promise.resolve([
        {
          externalId: 'Abcdefghijk',
          title: 'T',
          channel: null,
          durationSec: 60,
          thumbnailUrl: null,
          embeddable: true,
          live: false,
        },
      ]),
    ),
  };
  const tracks = { upsert: jest.fn(() => Promise.resolve(track)) };
  return {
    s: new SearchService(prisma as never, youtube as never, tracks as never),
    youtube,
    prisma,
  };
}

describe('SearchService cache (R-35)', () => {
  it('TC-149 23:59 old → cache hit, no API call', async () => {
    const { s, youtube } = make(SEARCH_TTL_MS - 60_000);
    expect(await s.search('m', 'q')).toHaveLength(1);
    expect(youtube.search).not.toHaveBeenCalled();
  });
  it('TC-149 24:01 old → refreshed from YouTube', async () => {
    const { s, youtube, prisma } = make(SEARCH_TTL_MS + 60_000);
    await s.search('m', 'q');
    expect(youtube.search).toHaveBeenCalledTimes(1);
    expect(prisma.searchCache.upsert).toHaveBeenCalled();
  });
  it('TC-145 the 11th search in an hour is rate limited (cache hits count too)', async () => {
    const { s } = make(0);
    for (let i = 0; i < 10; i++) await s.search('m', 'q');
    const err = await s.search('m', 'q').catch((e: unknown) => e);
    expect((err as AppError).code).toBe('RATE_LIMITED');
  });
});
