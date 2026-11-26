import { accrualsDue, bandOn, ceilingLapses, serviceYears } from './time-maths';
import { parseLines } from './time-core';
import { withBands } from './leave.service';

// Answer 2755: service bands change only the yearly days and the ceiling; service counts from joining; a new band
// applies from the next credit after the anniversary.
const ID = '00000000-0000-4000-8000-000000000001';
const base = { leaveTypeId: ID, annualDays: 12, frequency: 'monthly' as const, proRata: true, rounding: 0, carryForwardMax: 30 };

describe('service bands (answer 2755)', () => {
  it('counts whole years from the joining date', () => {
    expect(serviceYears('2021-06-15', '2026-06-14')).toBe(4);
    expect(serviceYears('2021-06-15', '2026-06-15')).toBe(5);
    expect(bandOn([{ fromYears: 2, annualDays: 15 }, { fromYears: 5, annualDays: 18 }], '2021-06-15', '2026-06-01')?.annualDays).toBe(15);
    expect(bandOn([{ fromYears: 2, annualDays: 15 }, { fromYears: 5, annualDays: 18 }], '2021-06-15', '2026-07-01')?.annualDays).toBe(18);
    expect(bandOn([{ fromYears: 2, annualDays: 15 }], '2025-06-15', '2026-07-01')).toBeNull();
  });

  it('monthly: the band starts with the first credit after the anniversary (15 June: June at 12, July on at 18)', () => {
    const line = { ...base, bands: [{ fromYears: 5, annualDays: 18 }] };
    const due = accrualsDue(line, { yearStart: '2026-01-01', joinedOn: '2021-06-15', upTo: '2026-12-31' });
    const byMonth = Object.fromEntries(due.map((d) => [d.on.slice(0, 7), d.days]));
    expect(byMonth['2026-06']).toBe(1);
    expect(byMonth['2026-07']).toBe(1.5);
    expect(due.reduce((t, d) => t + d.days, 0)).toBe(6 * 1 + 6 * 1.5);
  });

  it('yearly: the credit at the year start uses the band on that day; a mid-year anniversary waits for next year', () => {
    const line = { ...base, frequency: 'yearly' as const, bands: [{ fromYears: 5, annualDays: 18 }] };
    expect(accrualsDue(line, { yearStart: '2026-01-01', joinedOn: '2021-06-15', upTo: '2026-12-31' })[0].days).toBe(12);
    expect(accrualsDue(line, { yearStart: '2027-01-01', joinedOn: '2021-06-15', upTo: '2027-12-31' })[0].days).toBe(18);
  });

  it('the ceiling follows the band of each credit', () => {
    const lapses = ceilingLapses([{ periodKey: 'a', on: '2026-06-01', days: 1 }, { periodKey: 'b', on: '2026-07-01', days: 1.5 }], 40, (on) => (on >= '2026-07-01' ? 45 : 40));
    expect(lapses).toEqual([{ periodKey: 'ceiling:a', on: '2026-06-01', days: -1 }]);
  });

  it('a band below a statutory floor is raised to it; a band is otherwise kept as set', () => {
    expect(withBands({ ...base, bands: [{ fromYears: 3, annualDays: 13 }] }, 15).bands![0].annualDays).toBe(15);
    expect(withBands({ ...base, bands: [{ fromYears: 3, annualDays: 13 }] }, 12).bands![0].annualDays).toBe(13);
  });

  it('bands are saved on the dated policy line', () => {
    expect(parseLines([{ ...base, bands: [{ fromYears: 2, annualDays: 15, maxBalance: 45 }, { fromYears: 5, annualDays: 18 }] }], new Set([ID]))[0].bands).toEqual([{ fromYears: 2, annualDays: 15, maxBalance: 45 }, { fromYears: 5, annualDays: 18 }]);
  });

  it('negative: bands out of order, zero years, too many days or unknown parts are refused', () => {
    const t = (bands: unknown) => () => parseLines([{ ...base, bands }], new Set([ID]));
    expect(t([{ fromYears: 5, annualDays: 18 }, { fromYears: 2, annualDays: 15 }])).toThrow(/more years than the one before/);
    expect(t([{ fromYears: 0, annualDays: 15 }])).toThrow(/1 to 50 whole years/);
    expect(t([{ fromYears: 2.5, annualDays: 15 }])).toThrow(/1 to 50 whole years/);
    expect(t([{ fromYears: 2, annualDays: 400 }])).toThrow(/0 to 366/);
    expect(t([{ fromYears: 2, annualDays: 15, carryForwardMax: 3 }])).toThrow(/expected shape/);
    expect(t(Array.from({ length: 11 }, (_, i) => ({ fromYears: i + 1, annualDays: 12 })))).toThrow(/up to 10/);
  });
});
