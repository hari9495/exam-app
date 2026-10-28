import { addedBreaks, daysTo, hoursBreaks, insideNotice, licenceValid, licencesNeeded, timeBreaks, type Limits, type PlanDay } from './roster-rules';
import { ShiftTimes } from './time-rules';

const shift = (start: number, end: number, breakMinutes = 30): ShiftTimes => ({ shiftId: `s${start}`, name: 'S', night: end < start, shiftStart: start, shiftEnd: end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes, breakAboveMinutes: 300 });
const DAY = shift(540, 1050); // 09:00–17:30, 8 h after a 30 m break
const L: Limits = { minRestMinutes: 660, dailyMinutes: 540, weeklyMinutes: 2880, spreadMinutes: 630, minWeeklyOffs: 1 };
// Monday 2 Nov 2026 … Sunday 8 Nov 2026
const week = (cells: (ShiftTimes | null)[], from = '2026-11-02'): PlanDay[] => cells.map((s, i) => ({ on: new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), shift: s, employed: true }));

describe('roster rules (feature sheet 1, 2, 4, 5, 8)', () => {
  it('hours a day: the limit passes, one minute over breaks', () => {
    expect(hoursBreaks(week([shift(480, 1050)]), L)).toEqual([]); // 9 h 30 m less 30 m = 9 h
    expect(hoursBreaks(week([shift(480, 1051)]), L).map((b) => b.kind)).toEqual(['hours']);
  });

  it('spread-over: 10 h 30 m passes, 10 h 31 m breaks (breaks included)', () => {
    expect(hoursBreaks(week([shift(480, 1110, 120)]), L).filter((b) => b.kind === 'spread')).toEqual([]);
    expect(hoursBreaks(week([shift(480, 1111, 120)]), L).filter((b) => b.kind === 'spread')).toHaveLength(1);
  });

  it('hours a week: six 8 h days = 48 h pass; a seventh breaks on that day', () => {
    expect(hoursBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, null]), L)).toEqual([]);
    const b = hoursBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, DAY]), L);
    expect(b.find((x) => x.kind === 'week')?.on).toBe('2026-11-08');
  });

  it('weekly off: a whole week needs one; a part week (joiner) is not judged', () => {
    expect(hoursBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, DAY]), { ...L, weeklyMinutes: 99999 }).map((x) => x.kind)).toEqual(['weekly_off']);
    expect(hoursBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, DAY]), { ...L, weeklyMinutes: 99999, minWeeklyOffs: 0 })).toEqual([]);
    const joiner = week([null, null, DAY, DAY, DAY, DAY, DAY]).map((d, i) => ({ ...d, employed: i >= 2 }));
    expect(hoursBreaks(joiner, L)).toEqual([]);
  });

  it('rest: night then morning breaks the 11 h rest; a day off between passes', () => {
    const night = shift(1320, 360);
    expect(timeBreaks(week([night, shift(840, 1320)]), L).map((b) => b.kind)).toEqual(['rest']); // 06:00 → 14:00 = 8 h
    expect(timeBreaks(week([night, null, shift(360, 840)]), L)).toEqual([]);
  });

  it('a change is judged only by the breaks it adds', () => {
    const before = timeBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, DAY]), L);
    const after = timeBreaks(week([DAY, DAY, DAY, DAY, DAY, DAY, shift(360, 840)]), L);
    expect(addedBreaks(before, after)).toEqual([]);
    expect(addedBreaks([], before).length).toBe(before.length);
  });

  it('licences: by shift or by role, at every location or one; expiry day counts, the day after does not; leap day', () => {
    const reqs = [{ licenceTypeId: 'fork', shiftId: null, designationId: 'driver', locationId: null }, { licenceTypeId: 'boiler', shiftId: 'b', designationId: null, locationId: 'hosur' }];
    expect(licencesNeeded(reqs, { shiftId: 'b', designationId: 'driver', locationId: 'hosur' }).sort()).toEqual(['boiler', 'fork']);
    expect(licencesNeeded(reqs, { shiftId: 'b', designationId: 'clerk', locationId: 'chennai' })).toEqual([]);
    const held = [{ licenceTypeId: 'fork', validFrom: '2026-01-01', expiresOn: '2028-02-29' }];
    expect(licenceValid(held, 'fork', '2028-02-29')).toBe(true);
    expect(licenceValid(held, 'fork', '2028-03-01')).toBe(false);
    expect(licenceValid(held, 'fork', '2025-12-31')).toBe(false);
    expect(licenceValid([{ licenceTypeId: 'fork', validFrom: '2026-01-01', expiresOn: null }], 'fork', '2099-01-01')).toBe(true);
    expect(licenceValid([], 'fork', '2026-11-05', [{ licenceTypeId: 'fork', until: '2026-11-05' }])).toBe(true);
    expect(licenceValid([], 'fork', '2026-11-06', [{ licenceTypeId: 'fork', until: '2026-11-05' }])).toBe(false);
    expect(daysTo('2026-11-02', '2026-11-01')).toBe(-1);
  });

  it('notice: a shift starting within the notice needs a reason (IST), one starting after it does not; 0 h means never', () => {
    const now = new Date('2026-11-02T03:30:00Z'); // 09:00 IST
    expect(insideNotice('2026-11-03', [540], 'Asia/Kolkata', 24, now)).toBe(false); // exactly 24 h ahead: outside
    expect(insideNotice('2026-11-03', [539], 'Asia/Kolkata', 24, now)).toBe(true);
    expect(insideNotice('2026-11-03', [541, 480], 'Asia/Kolkata', 24, now)).toBe(true); // the earlier of before/after
    expect(insideNotice('2026-11-03', [null, null], 'Asia/Kolkata', 24, now)).toBe(false);
    expect(insideNotice('2026-11-02', [600], 'Asia/Kolkata', 0, now)).toBe(false);
  });
});
