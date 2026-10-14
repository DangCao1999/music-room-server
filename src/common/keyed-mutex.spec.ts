import { KeyedMutex } from './keyed-mutex';

describe('KeyedMutex', () => {
  it('runs same-key tasks one at a time, in order, even when one fails', async () => {
    const m = new KeyedMutex();
    const log: string[] = [];
    const task =
      (name: string, ms: number, fail = false) =>
      () =>
        new Promise<string>((res, rej) =>
          setTimeout(() => {
            log.push(name);
            if (fail) rej(new Error(name));
            else res(name);
          }, ms),
        );
    const a = m.run('r', task('a', 30));
    const b = m.run('r', task('b', 1, true));
    const c = m.run('r', task('c', 1));
    const other = m.run('x', task('x', 1));
    await expect(a).resolves.toBe('a');
    await expect(b).rejects.toThrow('b');
    await expect(c).resolves.toBe('c');
    await other;
    expect(log).toEqual(['x', 'a', 'b', 'c']);
  });
});
