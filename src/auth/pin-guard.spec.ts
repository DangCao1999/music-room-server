import { PinGuard } from './pin-guard';

describe('PinGuard (R-08)', () => {
  const MIN = 60_000;
  it('TC-031 counts down remaining attempts', () => {
    const g = new PinGuard();
    expect(g.fail('k', 0)).toEqual({ locked: false, remaining: 4 });
    expect(g.fail('k', 1)).toEqual({ locked: false, remaining: 3 });
    expect(g.fail('k', 2)).toEqual({ locked: false, remaining: 2 });
    expect(g.fail('k', 3)).toEqual({ locked: false, remaining: 1 });
  });
  it('TC-032 5th failure locks for 15 minutes; correct PIN still blocked', () => {
    const g = new PinGuard();
    for (let i = 0; i < 4; i++) g.fail('k', i);
    expect(g.fail('k', 4)).toEqual({ locked: true, minutes: 15 });
    expect(g.check('k', 5)).toEqual({ locked: true, minutes: 15 });
  });
  it('TC-033 lock expires after exactly 15 minutes', () => {
    const g = new PinGuard();
    for (let i = 0; i < 5; i++) g.fail('k', 0);
    expect(g.check('k', 14 * MIN + 59_000).locked).toBe(true);
    expect(g.check('k', 15 * MIN + 1_000).locked).toBe(false);
  });
  it('failures older than 15 minutes are forgotten', () => {
    const g = new PinGuard();
    for (let i = 0; i < 4; i++) g.fail('k', 0);
    expect(g.fail('k', 16 * MIN)).toEqual({ locked: false, remaining: 4 });
  });
  it('reset clears failures after a success', () => {
    const g = new PinGuard();
    g.fail('k', 0);
    g.reset('k');
    expect(g.fail('k', 1)).toEqual({ locked: false, remaining: 4 });
  });
  it('rounds the remaining lock time up to whole minutes', () => {
    const g = new PinGuard();
    for (let i = 0; i < 5; i++) g.fail('k', 0);
    expect(g.check('k', 14 * MIN + 1)).toEqual({ locked: true, minutes: 1 });
  });
});
