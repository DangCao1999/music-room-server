import { EnvError, parseEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  PUBLIC_URL: 'http://192.168.1.20:8080',
};

describe('parseEnv (R-46)', () => {
  it('accepts the minimal set and applies defaults', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3001);
    expect(env.SETUP_PASSWORD).toBeUndefined();
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.JOIN_LIMIT_PER_MINUTE).toBe(20);
  });

  it('TC-191 missing DATABASE_URL is reported by name', () => {
    expect(() => parseEnv({ PUBLIC_URL: base.PUBLIC_URL })).toThrow(EnvError);
    expect(() => parseEnv({ PUBLIC_URL: base.PUBLIC_URL })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('TC-191 invalid PUBLIC_URL explains the expected format', () => {
    expect(() => parseEnv({ ...base, PUBLIC_URL: 'abc' })).toThrow(
      'Biến môi trường không hợp lệ: PUBLIC_URL (phải là URL http/https)',
    );
  });

  it('treats empty optional strings as unset', () => {
    const env = parseEnv({ ...base, SETUP_PASSWORD: '', YOUTUBE_API_KEY: ' ' });
    expect(env.SETUP_PASSWORD).toBeUndefined();
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('parses CORS_ORIGINS and TRUST_PROXY', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: 'http://a.test, http://b.test',
      TRUST_PROXY: 'true',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.TRUST_PROXY).toBe(true);
  });

  it('refuses YOUTUBE_FAKE in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', YOUTUBE_FAKE: '1' }),
    ).toThrow(/YOUTUBE_FAKE/);
    expect(parseEnv({ ...base, YOUTUBE_FAKE: '1' }).YOUTUBE_FAKE).toBe(true);
  });
});
