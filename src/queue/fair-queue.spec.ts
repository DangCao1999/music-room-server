import { FairItem, orderQueue } from './fair-queue';

let seq = 0;
const item = (
  addedById: string | null,
  addedAt: number,
  extra: Partial<FairItem> = {},
): FairItem => ({
  id: extra.id ?? `i${++seq}`,
  addedById,
  addedAt,
  pinnedAt: null,
  hearts: 0,
  ...extra,
});
const ids = (xs: FairItem[]) => xs.map((x) => x.id);
const none = new Map<string, number | null>();

describe('orderQueue (R-18)', () => {
  it('TC-070 A1,A2,A3 then B1 → A1,B1,A2,A3', () => {
    const q = [
      item('an', 1, { id: 'A1' }),
      item('an', 2, { id: 'A2' }),
      item('an', 3, { id: 'A3' }),
      item('binh', 4, { id: 'B1' }),
    ];
    expect(ids(orderQueue(q, none))).toEqual(['A1', 'B1', 'A2', 'A3']);
  });

  it('TC-071 after A1 played, Chi adds C1 → B1,C1,A2,A3', () => {
    const q = [
      item('an', 2, { id: 'A2' }),
      item('an', 3, { id: 'A3' }),
      item('binh', 4, { id: 'B1' }),
      item('chi', 5, { id: 'C1' }),
    ];
    const last = new Map<string, number | null>([['an', 100]]);
    expect(ids(orderQueue(q, last))).toEqual(['B1', 'C1', 'A2', 'A3']);
  });

  it('TC-072 hearts win inside the round → C1,B1,A2,A3', () => {
    const q = [
      item('an', 2, { id: 'A2' }),
      item('an', 3, { id: 'A3' }),
      item('binh', 4, { id: 'B1' }),
      item('chi', 5, { id: 'C1', hearts: 2 }),
    ];
    const last = new Map<string, number | null>([['an', 100]]);
    expect(ids(orderQueue(q, last))).toEqual(['C1', 'B1', 'A2', 'A3']);
  });

  it('TC-073 pinned items first, by pin time', () => {
    const q = [
      item('an', 1, { id: 'A1' }),
      item('binh', 2, { id: 'X', pinnedAt: 20 }),
      item('chi', 3, { id: 'Y', pinnedAt: 10 }),
    ];
    expect(ids(orderQueue(q, none))).toEqual(['Y', 'X', 'A1']);
  });

  it('TC-073 pinned items do not consume the member round', () => {
    const q = [
      item('an', 1, { id: 'A1', pinnedAt: 5 }),
      item('an', 2, { id: 'A2' }),
      item('binh', 3, { id: 'B1' }),
    ];
    // A2 is An's first *unpinned* item → round 0 together with B1.
    expect(ids(orderQueue(q, none))).toEqual(['A1', 'A2', 'B1']);
  });

  it('TC-074 ties → addedAt, then id', () => {
    const q = [
      item('b', 5, { id: 'b1' }),
      item('a', 5, { id: 'a1' }),
      item('c', 4, { id: 'c1' }),
    ];
    expect(ids(orderQueue(q, none))).toEqual(['c1', 'a1', 'b1']);
  });

  it('TC-074 never-played members go before recently played ones', () => {
    const q = [item('old', 1, { id: 'o1' }), item('new', 9, { id: 'n1' })];
    const last = new Map<string, number | null>([
      ['old', 50],
      ['new', null],
    ]);
    expect(ids(orderQueue(q, last))).toEqual(['n1', 'o1']);
  });

  it('TC-075 hearts never jump rounds', () => {
    const q = [
      item('an', 1, { id: 'A1' }),
      item('an', 2, { id: 'A2', hearts: 9 }),
      item('binh', 3, { id: 'B1' }),
    ];
    expect(ids(orderQueue(q, none))).toEqual(['A1', 'B1', 'A2']);
  });

  it('TC-076 empty and single member', () => {
    expect(orderQueue([], none)).toEqual([]);
    const q = [item('an', 3, { id: 'x3' }), item('an', 1, { id: 'x1' })];
    expect(ids(orderQueue(q, none))).toEqual(['x1', 'x3']);
  });

  it('assigns 1-based rounds (0 for pinned)', () => {
    const q = [
      item('an', 1, { id: 'A1' }),
      item('an', 2, { id: 'A2' }),
      item('binh', 3, { id: 'P', pinnedAt: 1 }),
    ];
    const out = orderQueue(q, none);
    expect(out.map((x) => [x.id, x.round])).toEqual([
      ['P', 0],
      ['A1', 1],
      ['A2', 2],
    ]);
  });

  it('does not mutate the input', () => {
    const q = [item('b', 2, { id: 'b' }), item('a', 1, { id: 'a' })];
    const before = ids(q);
    orderQueue(q, none);
    expect(ids(q)).toEqual(before);
  });

  it('TC-077 50 members × 4 items orders in < 2ms on average', () => {
    const q: FairItem[] = [];
    for (let m = 0; m < 50; m++)
      for (let k = 0; k < 4; k++)
        q.push(item(`m${m}`, m * 10 + k, { hearts: (m * k) % 3 }));
    const runs = 100;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) orderQueue(q, none);
    expect((performance.now() - t0) / runs).toBeLessThan(2);
  });
});
