import { AppError } from '../common/app-error';
import { Prisma } from '../generated/prisma/client';
import { MembersService } from './members.service';

jest.mock('../rooms/room-code', () => ({
  generateRoomCode: jest.fn(() => 'AAAAAA'),
}));

const dup = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });

function service(failures: number) {
  let calls = 0;
  const prisma = {
    $transaction: jest.fn(() => {
      calls++;
      if (calls <= failures) return Promise.reject(dup());
      return Promise.resolve({ id: 'm1', roomId: 'r1', tokenVersion: 0 });
    }),
  };
  const auth = {
    checkSetupPassword: jest.fn(),
    hashPin: jest.fn(() => Promise.resolve('hash')),
    sign: jest.fn(() => 'token'),
  };
  const s = new MembersService(
    prisma as never,
    auth as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { s, prisma };
}

const input = { name: 'Dev', displayName: 'An', adminPin: '1234' };

describe('room code collisions (TC-009)', () => {
  it('retries after two collisions and succeeds', async () => {
    const { s, prisma } = service(2);
    await expect(s.create(input)).resolves.toMatchObject({
      code: 'AAAAAA',
      token: 'token',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('gives up with INTERNAL after 5 collisions', async () => {
    const { s, prisma } = service(99);
    const err = await s.create(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INTERNAL');
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});
