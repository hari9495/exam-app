import { Candidate, MAX_EXPLAINED, Slot, coverage, fairOrder, fill, reasonCounts, slotOrder } from './auto-roster-plan';

const person = (employeeId: string, minutes = 0, nights = 0, code: string | null = employeeId.toUpperCase()): Candidate => ({ employeeId, name: `Person ${employeeId}`, code, minutes, nights });
const slot = (over: Partial<Slot> = {}): Slot => ({ on: '2026-11-02', shiftId: 'M', code: 'M', start: 360, minutes: 450, night: false, need: 1, had: 0, candidates: [], ...over });
const pool = (...list: Candidate[]) => new Map(list.map((c) => [c.employeeId, c]));
const yes = async () => null;
const placeAll = async () => true;

describe('auto-roster fair order', () => {
  it('fewest minutes first, then fewest nights, then employee code (numeric), then id; no code goes last', () => {
    const list = [person('a', 900, 0, 'E10'), person('b', 450, 2, 'E2'), person('c', 450, 1, 'E9'), person('d', 450, 1, 'E3'), person('e', 450, 1, null), person('f', 0, 5, 'E99')];
    expect(fairOrder(list).map((c) => c.employeeId)).toEqual(['f', 'd', 'c', 'e', 'b', 'a']);
  });

  it('ties on everything fall back to the id, so the order never depends on input order', () => {
    const a = [person('y', 0, 0, 'E1'), person('x', 0, 0, 'E1')];
    expect(fairOrder(a).map((c) => c.employeeId)).toEqual(['x', 'y']);
    expect(fairOrder([...a].reverse()).map((c) => c.employeeId)).toEqual(['x', 'y']);
  });

  it('slots go day by day, earliest start first, then code', () => {
    const s = [slot({ on: '2026-11-03', code: 'A' }), slot({ on: '2026-11-02', start: 1320, code: 'N' }), slot({ on: '2026-11-02', start: 360, code: 'Z' }), slot({ on: '2026-11-02', start: 360, code: 'M' })];
    expect(slotOrder(s).map((x) => `${x.on.slice(8)}${x.code}`)).toEqual(['02M', '02Z', '02N', '03A']);
  });
});

describe('auto-roster fill', () => {
  it('places only the shortfall, in the fair order, and the order follows the run (hours grow with each placement)', async () => {
    const people = pool(person('a', 450), person('b', 0), person('c', 0));
    const placed: string[] = [];
    const r = await fill(
      [slot({ need: 3, had: 1, candidates: ['a', 'b', 'c'] }), slot({ on: '2026-11-03', need: 1, candidates: ['a', 'b', 'c'] })],
      people,
      yes,
      async (c, s) => (placed.push(`${s.on.slice(8)}:${c.employeeId}`), true),
    );
    expect(placed).toEqual(['02:b', '02:c', '03:a']);
    expect(r[0]).toMatchObject({ need: 3, had: 1, got: 3, skipped: [], reasons: [] });
    expect(people.get('b')!.minutes).toBe(450);
  });

  it('nights break a tie in hours and are counted for night slots', async () => {
    const people = pool(person('a', 0, 1), person('b', 0, 0));
    const r = await fill([slot({ night: true, need: 1, candidates: ['a', 'b'] })], people, yes, placeAll);
    expect(r[0].placed.map((p) => p.employeeId)).toEqual(['b']);
    expect(people.get('b')!.nights).toBe(1);
  });

  it('a full slot (had ≥ need) places no one; need 0 is skipped; over-staffing is kept as got', async () => {
    const r = await fill([slot({ need: 2, had: 3, candidates: ['a'] }), slot({ code: 'E', start: 840, need: 0, candidates: ['a'] })], pool(person('a')), yes, placeAll);
    expect(r.map((x) => [x.got, x.placed.length])).toEqual([[3, 0], [0, 0]]);
  });

  it('one shift a day: someone placed on the morning is skipped for the evening with the reason', async () => {
    const r = await fill([slot({ code: 'M', candidates: ['a'] }), slot({ code: 'E', shiftId: 'E', start: 840, candidates: ['a'] })], pool(person('a')), yes, placeAll);
    expect(r[1]).toMatchObject({ got: 0, skipped: [{ employeeId: 'a', kind: 'placed', why: 'Placed on M that day' }] });
  });

  it('an unfilled slot explains every candidate it tried, with counts by reason', async () => {
    const why = { a: { kind: 'leave' as const, why: 'On leave' }, b: { kind: 'rest' as const, why: '8 h rest' }, c: { kind: 'rest' as const, why: '9 h rest' } };
    const r = await fill([slot({ need: 2, candidates: ['a', 'b', 'c', 'd'] })], pool(person('a'), person('b'), person('c'), person('d')), async (c) => why[c.employeeId as keyof typeof why] ?? null, placeAll);
    expect(r[0].got).toBe(1);
    expect(r[0].placed).toEqual([{ employeeId: 'd', name: 'Person d' }]);
    expect(r[0].skipped.map((s) => s.kind)).toEqual(['leave', 'rest', 'rest']);
    expect(r[0].reasons).toEqual([{ kind: 'rest', label: 'Not enough rest between shifts', count: 2 }, { kind: 'leave', label: 'On leave (approved or waiting)', count: 1 }]);
    expect(r[0].noCandidates).toBe(false);
  });

  it('no one to try is said plainly; the explanation keeps at most MAX_EXPLAINED people but counts them all', async () => {
    expect((await fill([slot({ need: 1 })], pool(), yes, placeAll))[0]).toMatchObject({ got: 0, noCandidates: true });
    const many = Array.from({ length: MAX_EXPLAINED + 5 }, (_, i) => person(`p${String(i).padStart(3, '0')}`));
    const r = await fill([slot({ need: 1, candidates: many.map((c) => c.employeeId) })], pool(...many), async () => ({ kind: 'hours', why: 'x' }), placeAll);
    expect(r[0].skipped).toHaveLength(MAX_EXPLAINED);
    expect(r[0].reasons).toEqual([{ kind: 'hours', label: 'Too many hours that day', count: MAX_EXPLAINED + 5 }]);
  });

  it('a day taken while the run went (place answers false) moves on to the next person', async () => {
    const r = await fill([slot({ need: 1, candidates: ['a', 'b'] })], pool(person('a'), person('b', 10)), yes, async (c) => c.employeeId !== 'a');
    expect(r[0].placed.map((p) => p.employeeId)).toEqual(['b']);
  });

  it('a filled slot keeps no explanation', async () => {
    const r = await fill([slot({ need: 1, candidates: ['a', 'b'] })], pool(person('a'), person('b', 10)), async (c) => (c.employeeId === 'a' ? { kind: 'licence', why: 'x' } : null), placeAll);
    expect(r[0]).toMatchObject({ got: 1, skipped: [], reasons: [] });
  });
});

describe('auto-roster coverage maths', () => {
  it('filled never counts over-staffing; short and over slots are counted', () => {
    expect(coverage([{ need: 3, got: 2 }, { need: 2, got: 4 }, { need: 0, got: 1 }, { need: 1, got: 1 }])).toEqual({ required: 6, filled: 5, unfilled: 1, shortSlots: 1, overSlots: 2 });
    expect(coverage([])).toEqual({ required: 0, filled: 0, unfilled: 0, shortSlots: 0, overSlots: 0 });
  });

  it('reason counts sort by count, then kind', () => {
    expect(reasonCounts([{ employeeId: 'a', name: 'a', kind: 'week', why: '' }, { employeeId: 'b', name: 'b', kind: 'licence', why: '' }]).map((r) => r.kind)).toEqual(['licence', 'week']);
  });
});
