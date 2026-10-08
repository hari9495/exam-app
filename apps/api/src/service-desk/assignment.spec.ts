import { chooseAgent, isAvailable } from './assignment';

// SD-1.06 assignment rules (US-B-087, US-G-011).
describe('automatic assignment', () => {
  const free = { status: 'available', awayUntil: null, shiftStartMinute: null, shiftEndMinute: null, shiftDays: [1, 2, 3, 4, 5], shiftTimeZone: null };
  const now = new Date('2026-10-07T06:30:00Z'); // Wed 12:00 IST

  it('round-robin takes the next member after the last one, then wraps', () => {
    const c = [{ userId: 'a', open: 0 }, { userId: 'b', open: 9 }, { userId: 'c', open: 1 }];
    expect(chooseAgent('round_robin', c, null, null)).toBe('a');
    expect(chooseAgent('round_robin', c, 'a', null)).toBe('b');
    expect(chooseAgent('round_robin', c, 'c', null)).toBe('a');
    // The last one left the group: the next in order still gets it.
    expect(chooseAgent('round_robin', c, 'bb', null)).toBe('c');
  });

  it('load goes to the fewest open tickets, ties in stable order; the cap and manual give nobody', () => {
    const c = [{ userId: 'b', open: 2 }, { userId: 'a', open: 2 }, { userId: 'c', open: 5 }];
    expect(chooseAgent('load', c, null, null)).toBe('a');
    expect(chooseAgent('load', [{ userId: 'a', open: 4 }, { userId: 'b', open: 1 }, { userId: 'c', open: 2 }], null, 2)).toBe('b');
    expect(chooseAgent('load', [{ userId: 'a', open: 3 }], null, 3)).toBeNull();
    expect(chooseAgent('manual', c, null, null)).toBeNull();
    expect(chooseAgent('round_robin', [], null, null)).toBeNull();
  });

  it('skips agents who are away until their away time passes', () => {
    expect(isAvailable(undefined, now)).toBe(true);
    expect(isAvailable(free, now)).toBe(true);
    expect(isAvailable({ ...free, status: 'away' }, now)).toBe(false);
    expect(isAvailable({ ...free, status: 'away', awayUntil: new Date('2026-10-07T07:00:00Z') }, now)).toBe(false);
    expect(isAvailable({ ...free, status: 'away', awayUntil: new Date('2026-10-07T06:00:00Z') }, now)).toBe(true);
  });

  it('skips agents outside their shift, in the shift time zone, overnight shifts included', () => {
    const day = { ...free, shiftStartMinute: 9 * 60, shiftEndMinute: 18 * 60, shiftTimeZone: 'Asia/Kolkata' };
    expect(isAvailable(day, now)).toBe(true);
    expect(isAvailable(day, new Date('2026-10-07T13:00:00Z'))).toBe(false); // 18:30 IST
    expect(isAvailable(day, new Date('2026-10-10T06:30:00Z'))).toBe(false); // Saturday
    const night = { ...free, shiftStartMinute: 22 * 60, shiftEndMinute: 6 * 60, shiftTimeZone: 'Asia/Kolkata', shiftDays: [5] };
    expect(isAvailable(night, new Date('2026-10-09T17:00:00Z'))).toBe(true); // Fri 22:30 IST
    expect(isAvailable(night, new Date('2026-10-09T23:00:00Z'))).toBe(true); // Sat 04:30 IST, Friday's shift
    expect(isAvailable(night, new Date('2026-10-10T17:00:00Z'))).toBe(false); // Sat 22:30 IST
  });
});
