import type { Response } from 'express';
import type { Env } from '../config/env';
import type { YouTubeProvider } from '../music/youtube.provider';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

function res() {
  const r = { code: 0, body: undefined as unknown };
  const response = {} as Response;
  response.status = (c: number) => {
    r.code = c;
    return response;
  };
  response.json = (b: unknown) => {
    r.body = b;
    return response;
  };
  return { r, response };
}

describe('HealthController (R-45, TC-190)', () => {
  const env = { SETUP_PASSWORD: undefined } as Env;
  const yt = { searchEnabled: false } as YouTubeProvider;

  it('200 when the database answers', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([1]),
    } as unknown as PrismaService;
    const { r, response } = res();
    await new HealthController(prisma, yt, env).health(response);
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({
      status: 'ok',
      db: 'up',
      setupRequired: false,
      searchEnabled: false,
    });
  });

  it('503 when the database is down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as PrismaService;
    const { r, response } = res();
    await new HealthController(prisma, yt, env).health(response);
    expect(r.code).toBe(503);
    expect(r.body).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
