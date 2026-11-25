import { fairOrder, minutesBetween, nextShift, overlaps, paidMinutes, slotSpanError, startsAt } from './roster-extras-rules';

const bid = (employeeId: string, won30: number, weekMinutes: number, at: string, code: string | null = employeeId) => ({ employeeId, code, won30, weekMinutes, bidAt: new Date(at) });

describe('fair order (rule 9)', () => {
  it('fewest won first, then fewest hours, then earliest bid, then code', () => {
    const order = fairOrder([
      bid('a', 2, 0, '2026-11-01T08:00:00Z'),
      bid('b', 0, 2400, '2026-11-01T09:00:00Z'),
      bid('c', 0, 1200, '2026-11-01T10:00:00Z'),
      bid('d', 0, 1200, '2026-11-01T07:00:00Z'),
      bid('f', 0, 1200, '2026-11-01T07:00:00Z', 'E02'),
      bid('e', 0, 1200, '2026-11-01T07:00:00Z', 'E01'),
    ]).map((b) => b.employeeId);
    expect(order).toEqual(['d', 'e', 'f', 'c', 'b', 'a']);
  });

  it('a person with no code goes after one with a code on a full tie; empty stays empty', () => {
    expect(fairOrder([bid('x', 0, 0, '2026-11-01T07:00:00Z', null), bid('y', 0, 0, '2026-11-01T07:00:00Z', 'Z9')]).map((b) => b.employeeId)).toEqual(['y', 'x']);
    expect(fairOrder([])).toEqual([]);
  });
});

describe('call-out paid time (rule 10)', () => {
  it('paid is the minimum when less was worked, the work when more, and the work with a zero minimum', () => {
    expect(paidMinutes(30, 2)).toBe(120);
    expect(paidMinutes(120, 2)).toBe(120);
    expect(paidMinutes(121, 2)).toBe(121);
    expect(paidMinutes(1, 0)).toBe(1);
    expect(paidMinutes(10, 1.5)).toBe(90);
  });
});

describe('rest left and the next shift', () => {
  const day = (on: string, shiftStart: number | null) => ({ on, shift: shiftStart === null ? null : { shiftStart } });
  it('finds the first shift starting after the call-out ends, in the location zone', () => {
    const ended = new Date('2026-11-03T21:00:00Z'); // 2:30 am IST on 4 Nov
    const n = nextShift([day('2026-11-03', 570), day('2026-11-04', 570), day('2026-11-05', 570)], 'Asia/Kolkata', ended)!;
    expect(n.on).toBe('2026-11-04');
    expect(n.at.toISOString()).toBe('2026-11-04T04:00:00.000Z');
    expect(minutesBetween(ended, n.at)).toBe(7 * 60);
  });
  it('skips days off; none left is null; exactly at the end counts', () => {
    const ended = startsAt('2026-11-04', 570, 'Asia/Kolkata');
    expect(nextShift([day('2026-11-04', 570)], 'Asia/Kolkata', ended)?.on).toBe('2026-11-04');
    expect(nextShift([day('2026-11-04', null), day('2026-11-05', null)], 'Asia/Kolkata', ended)).toBeNull();
  });
});

describe('standby slot span', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 10, 2, 0) + h * 3_600_000);
  it('24 h is the limit; end before or at start is refused', () => {
    expect(slotSpanError(t(0), t(24))).toBeNull();
    expect(slotSpanError(t(0), new Date(t(24).getTime() + 60_000))).toMatch(/at most 24 hours/);
    expect(slotSpanError(t(2), t(2))).toMatch(/after the start/);
    expect(slotSpanError(t(3), t(2))).toMatch(/after the start/);
  });
  it('overlap is end exclusive', () => {
    expect(overlaps({ start: t(0), end: t(12) }, { start: t(12), end: t(20) })).toBe(false);
    expect(overlaps({ start: t(0), end: t(12) }, { start: t(11), end: t(20) })).toBe(true);
  });
});
