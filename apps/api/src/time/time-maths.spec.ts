import { accrualsDue, applyFloors, breakMinutes, checkInVerdict, countLeaveDays, evaluateDay, instantAt, ipInRanges, isWeeklyOff, leaveYearOf, minutesInto, roundTo, workOnFor, yearEndSplit, type CountRules, type DayInput, type HolidayOn } from './time-maths';

const SUN = [{ weekday: 7 }];
const SAT_SUN = [{ weekday: 6 }, { weekday: 7 }];
const none: CountRules = { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false };
const sandwich: CountRules = { sandwich: 'sandwich', sandwichOn: 'both', sandwichHalfDays: false };
const noHolidays = new Map<string, HolidayOn>();
const count = (from: string, to: string, rules: CountRules, o: { fromHalf?: 'full' | 'second'; toHalf?: 'full' | 'first'; holidays?: Map<string, HolidayOn>; offs?: { weekday: number; nth?: number[] }[] } = {}) =>
  countLeaveDays({ from, to, fromHalf: o.fromHalf ?? 'full', toHalf: o.toHalf ?? 'full', holidays: o.holidays ?? noHolidays, weeklyOff: (d) => isWeeklyOff(d, o.offs ?? SAT_SUN), rules });

describe('weekly offs (Q1)', () => {
  it('Sundays, and the 2nd and 4th Saturday only', () => {
    const rules = [{ weekday: 7 }, { weekday: 6, nth: [2, 4] }];
    // October 2026: Saturdays 3, 10, 17, 24, 31.
    expect(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'].map((d) => isWeeklyOff(d, rules))).toEqual([false, true, false, true, false]);
    expect(isWeeklyOff('2026-10-04', rules)).toBe(true);
    expect(isWeeklyOff('2026-10-05', rules)).toBe(false);
  });
});

describe('counting leave days (YX-LV-03, L3)', () => {
  it('Fri + Mon with mode None does not count Sat / Sun; with Sandwich it does (M02 acceptance test)', () => {
    expect(count('2026-10-09', '2026-10-12', none).total).toBe(2);
    const s = count('2026-10-09', '2026-10-12', sandwich);
    expect(s.total).toBe(4);
    expect(s.days.map((d) => d.countedAs)).toEqual(['leave', 'sandwich', 'sandwich', 'leave']);
  });

  it('a weekend at the edge of the range is never sandwiched', () => {
    expect(count('2026-10-09', '2026-10-11', sandwich).total).toBe(1);
  });

  it('a half day next to the gap does not sandwich it unless the type says so', () => {
    expect(count('2026-10-09', '2026-10-12', sandwich, { toHalf: 'first' }).total).toBe(1.5);
    expect(count('2026-10-09', '2026-10-12', { ...sandwich, sandwichHalfDays: true }, { toHalf: 'first' }).total).toBe(3.5);
  });

  it('Always counts every non-working day inside the range; sandwichOn limits it to holidays', () => {
    const holidays = new Map([['2026-10-02', { name: 'Gandhi Jayanti', halfDay: false, openHalf: 'first' as const }]]);
    expect(count('2026-10-01', '2026-10-05', { sandwich: 'always', sandwichOn: 'both', sandwichHalfDays: false }, { holidays }).total).toBe(5);
    expect(count('2026-10-01', '2026-10-05', { sandwich: 'always', sandwichOn: 'holidays', sandwichHalfDays: false }, { holidays }).total).toBe(3);
    expect(count('2026-10-01', '2026-10-05', none, { holidays }).total).toBe(2);
  });

  it('half days at either end, and one half of one day', () => {
    expect(count('2026-10-05', '2026-10-07', none, { fromHalf: 'second', toHalf: 'first' }).total).toBe(2);
    expect(count('2026-10-05', '2026-10-05', none, { toHalf: 'first' })).toEqual({ total: 0.5, days: [{ on: '2026-10-05', part: 'first', portion: 0.5, countedAs: 'leave' }] });
    expect(count('2026-10-05', '2026-10-05', none, { fromHalf: 'second' }).days[0].part).toBe('second');
  });

  it('a half-day holiday leaves only its working half to take as leave', () => {
    const holidays = new Map([['2026-11-09', { name: 'Diwali eve', halfDay: true, openHalf: 'first' as const }]]);
    expect(count('2026-11-09', '2026-11-09', none, { holidays }).total).toBe(0.5);
    expect(count('2026-11-09', '2026-11-09', none, { holidays, fromHalf: 'second' }).total).toBe(0);
  });

  it('works across a month and a leap day', () => {
    expect(count('2028-02-28', '2028-03-01', none, { offs: SUN }).total).toBe(3);
  });
});

describe('leave year and rounding (L1, L4)', () => {
  it('calendar and financial years', () => {
    expect(leaveYearOf('2026-10-09', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(leaveYearOf('2027-02-01', 4)).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(leaveYearOf('2027-04-01', 4)).toEqual({ start: '2027-04-01', end: '2028-03-31' });
  });

  it('halfway rounds up', () => {
    expect(roundTo(1.25, 0.5)).toBe(1.5);
    expect(roundTo(1.24, 0.5)).toBe(1);
    expect(roundTo(1.125, 0.25)).toBe(1.25);
    expect(roundTo(2.5, 1)).toBe(3);
    expect(roundTo(1.666666, 0)).toBe(1.67);
  });
});

describe('accruals (YX-LV-02)', () => {
  const monthly = { annualDays: 18, frequency: 'monthly' as const, proRata: true, rounding: 0.5 };
  const sum = (xs: { days: number }[]) => Math.round(xs.reduce((s, x) => s + x.days, 0) * 100) / 100;

  it('a full year of monthly credits rounds each step and trues up to the exact entitlement', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-01-01', joinedOn: '2020-01-01', upTo: '2026-12-31' });
    expect(due).toHaveLength(12);
    expect(due[0]).toEqual({ periodKey: 'accrual:2026-01', on: '2026-01-01', days: 1.5 });
    expect(sum(due)).toBe(18);
  });

  it('a mid-month joiner gets the employed share of that month, and the year trues up to the pro-rata entitlement', () => {
    const due = accrualsDue({ ...monthly, annualDays: 12, rounding: 0.5 }, { yearStart: '2026-01-01', joinedOn: '2026-07-16', upTo: '2026-12-31' });
    expect(due[0].on).toBe('2026-07-16');
    expect(due[0].periodKey).toBe('accrual:2026-07');
    // July: 16 of 31 days of 1 day a month = 0.516 → 0.5; then 1 a month; the exact total is 5.52.
    expect(due[0].days).toBe(0.5);
    expect(sum(due)).toBe(5.52);
  });

  it('only what is due by today, and nothing twice (period keys)', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-01-01', joinedOn: '2020-01-01', upTo: '2026-03-15' });
    expect(due.map((d) => d.periodKey)).toEqual(['accrual:2026-01', 'accrual:2026-02', 'accrual:2026-03']);
  });

  it('yearly upfront credit, pro-rata for a joiner; nothing after an exit', () => {
    expect(accrualsDue({ annualDays: 12, frequency: 'yearly', proRata: true, rounding: 0.5 }, { yearStart: '2026-01-01', joinedOn: '2026-07-01', upTo: '2026-07-01' })).toEqual([{ periodKey: 'accrual:2026-01-01', on: '2026-07-01', days: 6 }]);
    expect(accrualsDue({ annualDays: 12, frequency: 'yearly', proRata: true, rounding: 0.5 }, { yearStart: '2026-01-01', joinedOn: '2027-01-02', upTo: '2026-12-31' })).toEqual([]);
    const leaver = accrualsDue({ ...monthly, annualDays: 12 }, { yearStart: '2026-01-01', joinedOn: '2020-01-01', exitedOn: '2026-03-31', upTo: '2026-12-31' });
    expect(sum(leaver)).toBe(3);
  });

  it('a financial year runs April to March', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-04-01', joinedOn: '2020-01-01', upTo: '2027-03-31' });
    expect(due[0].periodKey).toBe('accrual:2026-04');
    expect(due[11].periodKey).toBe('accrual:2027-03');
  });
});

describe('year end and statutory floors', () => {
  it('carry up to the cap, the rest lapses; a negative balance carries', () => {
    expect(yearEndSplit(40, 30)).toEqual({ carry: 30, lapse: 10 });
    expect(yearEndSplit(12.5, 30)).toEqual({ carry: 12.5, lapse: 0 });
    expect(yearEndSplit(-2, 30)).toEqual({ carry: -2, lapse: 0 });
    expect(yearEndSplit(50, null)).toEqual({ carry: 50, lapse: 0 });
  });

  it('a policy below the state floor is raised to it (Tamil Nadu casual + sick together)', () => {
    const lines = [{ kind: 'earned', annualDays: 15 }, { kind: 'casual', annualDays: 6 }, { kind: 'sick', annualDays: 4 }];
    const r = applyFloors(lines, [{ kinds: ['earned'], days: 12 }, { kinds: ['casual', 'sick'], days: 12 }]);
    expect(r.annual).toEqual([15, 8, 4]);
    expect(r.raised).toEqual([{ kinds: ['casual', 'sick'], from: 10, to: 12 }]);
  });
});

describe('check-in verdicts (YX-AT-01, YX-AT-23)', () => {
  const blr = { locationId: 'blr', name: 'Bengaluru head office', lat: 12.9716, lng: 77.5946, radiusM: 150, ipRanges: ['203.0.113.0/24'] };
  const maa = { locationId: 'maa', name: 'Chennai office', lat: 13.0067, lng: 80.2206, radiusM: 150, ipRanges: [] };

  it('inside any allowed fence is accepted, nearest first', () => {
    expect(checkInVerdict({ fences: [maa, blr], pin: { lat: 12.9718, lng: 77.5947, accuracyM: 20 }, ip: null, mode: 'restricted' })).toMatchObject({ accepted: true, verdict: 'inside', locationId: 'blr' });
  });

  it('outside is refused with a plain reason and the distance', () => {
    const v = checkInVerdict({ fences: [blr], pin: { lat: 12.9716, lng: 77.6026, accuracyM: 20 }, ip: null, mode: 'restricted' });
    expect(v.accepted).toBe(false);
    expect(v.message).toMatch(/^Outside Bengaluru head office, 8\d\d m away$/);
  });

  it('an allowed network is enough; a coarse fix is refused; field mode records and accepts', () => {
    expect(checkInVerdict({ fences: [blr], pin: null, ip: '203.0.113.9', mode: 'restricted' })).toMatchObject({ accepted: true, verdict: 'network' });
    expect(checkInVerdict({ fences: [blr], pin: { lat: 12.9716, lng: 77.5946, accuracyM: 300 }, ip: null, mode: 'restricted' })).toMatchObject({ accepted: false, verdict: 'coarse' });
    expect(checkInVerdict({ fences: [blr], pin: { lat: 13.5, lng: 77.5, accuracyM: 10 }, ip: null, mode: 'field' })).toMatchObject({ accepted: true, verdict: 'field' });
    expect(checkInVerdict({ fences: [blr], pin: null, ip: '8.8.8.8', mode: 'restricted' })).toMatchObject({ accepted: false, verdict: 'no_location' });
  });

  it('IPv4-mapped IPv6 and bad input', () => {
    expect(ipInRanges('::ffff:203.0.113.4', ['203.0.113.0/24'])).toBe(true);
    expect(ipInRanges('not-an-ip', ['203.0.113.0/24'])).toBe(false);
    expect(ipInRanges('2001:db8::1', ['203.0.113.0/24'])).toBe(false);
  });
});

describe('time zones', () => {
  it('a punch at 03:45 UTC is 09:15 in India on the same date; 20:00 UTC is the next Indian day', () => {
    expect(minutesInto('2026-10-05', 'Asia/Kolkata', new Date('2026-10-05T03:45:00Z'))).toBe(555);
    expect(workOnFor(new Date('2026-10-05T20:00:00Z'), 'Asia/Kolkata', { shiftStart: 540, shiftEnd: 1080 })).toBe('2026-10-06');
  });

  it('the morning end of a night shift belongs to the day the shift started', () => {
    // 22:00–06:00 shift, check-out 06:10 IST on the 6th.
    expect(workOnFor(new Date('2026-10-06T00:40:00Z'), 'Asia/Kolkata', { shiftStart: 1320, shiftEnd: 360 })).toBe('2026-10-05');
  });

  it('wall-clock minutes on a daylight-saving day (London, 29 Mar 2026: 12:00 UTC is 13:00 local)', () => {
    expect(minutesInto('2026-03-29', 'Europe/London', new Date('2026-03-29T12:00:00Z'))).toBe(780);
    expect(instantAt('2026-03-29', 'Europe/London', 780).toISOString()).toBe('2026-03-29T12:00:00.000Z');
    // 09:00 to 17:00 local across the jump is 8 real hours (the jump was at 01:00).
    const worked = (instantAt('2026-03-29', 'Europe/London', 17 * 60).getTime() - instantAt('2026-03-29', 'Europe/London', 9 * 60).getTime()) / 60_000;
    expect(worked).toBe(480);
  });
});

describe('the day engine (YX-AT-03, YX-AT-12)', () => {
  const rule = { shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 };
  const at = (hhmm: string) => instantAt('2026-10-05', 'Asia/Kolkata', Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
  const base: DayInput = { on: '2026-10-05', zone: 'Asia/Kolkata', mode: 'punch', weeklyOff: false, holiday: null, leave: null, punches: [], fix: null, rule, now: new Date('2026-10-07T00:00:00Z') };

  it('present, late beyond grace, break deducted', () => {
    const r = evaluateDay({ ...base, punches: [{ at: at('09:55'), kind: 'in' }, { at: at('18:40'), kind: 'out' }] });
    expect(r).toMatchObject({ status: 'present', lateMinutes: 15, workedMinutes: 495 });
  });

  it('a missing check-out is "missing check-out", never a threshold status (M02 acceptance test)', () => {
    expect(evaluateDay({ ...base, punches: [{ at: at('09:31'), kind: 'in' }] }).status).toBe('missing_out');
    expect(evaluateDay({ ...base, punches: [{ at: at('18:31'), kind: 'out' }] }).status).toBe('missing_in');
    // Today, before the day is over: not finished yet.
    expect(evaluateDay({ ...base, punches: [{ at: at('09:31'), kind: 'in' }], now: at('12:00') }).status).toBe('not_started');
  });

  it('short days are half days or absent; no punches on a past working day is absent', () => {
    expect(evaluateDay({ ...base, punches: [{ at: at('09:30'), kind: 'in' }, { at: at('14:00'), kind: 'out' }] }).status).toBe('half_day');
    expect(evaluateDay({ ...base, punches: [{ at: at('09:30'), kind: 'in' }, { at: at('11:00'), kind: 'out' }] }).status).toBe('absent');
    expect(evaluateDay(base).status).toBe('absent');
  });

  it('leave, weekly off and holiday come first; assumed present needs no punches', () => {
    expect(evaluateDay({ ...base, leave: 'full' }).status).toBe('leave');
    expect(evaluateDay({ ...base, weeklyOff: true }).status).toBe('weekly_off');
    expect(evaluateDay({ ...base, holiday: { name: 'Holiday', halfDay: false, openHalf: 'first' } }).status).toBe('holiday');
    expect(evaluateDay({ ...base, mode: 'assumed_present' }).status).toBe('present');
    expect(evaluateDay({ ...base, mode: 'timesheet' }).status).toBe('no_timesheet');
  });

  it('first-half leave: grace starts at the working half and half the hours make the day', () => {
    const r = evaluateDay({ ...base, leave: 'first', punches: [{ at: at('14:05'), kind: 'in' }, { at: at('18:31'), kind: 'out' }] });
    expect(r).toMatchObject({ status: 'present', leavePart: 'first', lateMinutes: 0 });
  });

  describe('punched breaks are not worked time (19 Oct 2026)', () => {
    const p = (kind: 'in' | 'out' | 'break_start' | 'break_end', hhmm: string) => ({ at: at(hhmm), kind });

    it('a 45-minute break comes off; the larger of the break taken and the shift rule wins, never both', () => {
      // 9:30 to 18:30 is 540 minutes. A 45-minute break is more than the rule's 30: 495 worked.
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '13:00'), p('break_end', '13:45'), p('out', '18:30')] }).workedMinutes).toBe(495);
      // A 10-minute break is less than the rule's 30 above 5 hours: the rule's 30 comes off, not 10 and not 40.
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '11:00'), p('break_end', '11:10'), p('out', '18:30')] }).workedMinutes).toBe(510);
      // Two breaks add up (20 + 25 = 45).
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '11:00'), p('break_end', '11:20'), p('break_start', '15:00'), p('break_end', '15:25'), p('out', '18:30')] }).workedMinutes).toBe(495);
    });

    it('a short day below the rule threshold loses only the break it punched', () => {
      // 9:30 to 13:30 is 240 (under 5 h, so no rule break); a 15-minute break: 225, and below the half-day line.
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '11:00'), p('break_end', '11:15'), p('out', '13:30')] })).toMatchObject({ workedMinutes: 225, status: 'absent' });
    });

    it('a break still open at check-out ends at check-out', () => {
      // On break from 17:30, checked out at 18:30 without ending it: 60 minutes of break.
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '17:30'), p('out', '18:30')] }).workedMinutes).toBe(480);
      expect(breakMinutes([p('in', '09:30'), p('break_start', '17:30'), p('out', '18:30')], at('09:30'), at('18:30'))).toBe(60);
    });

    it('a long break can turn a full day into a half day', () => {
      // 540 minutes with a 4-hour break: 300 worked, below the 480 full-day line.
      expect(evaluateDay({ ...base, punches: [p('in', '09:30'), p('break_start', '11:00'), p('break_end', '15:00'), p('out', '18:30')] })).toMatchObject({ workedMinutes: 300, status: 'half_day' });
    });

    it('a break across midnight on a night shift counts whole', () => {
      const night = { ...rule, shiftStart: 22 * 60, shiftEnd: 6 * 60 };
      const t = (on: string, hhmm: string) => instantAt(on, 'Asia/Kolkata', Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
      const punches = [
        { at: t('2026-10-05', '22:00'), kind: 'in' as const },
        { at: t('2026-10-05', '23:40'), kind: 'break_start' as const },
        { at: t('2026-10-06', '00:25'), kind: 'break_end' as const },
        { at: t('2026-10-06', '06:00'), kind: 'out' as const },
      ];
      // 480 minutes with a 45-minute break that crosses midnight: 435.
      expect(evaluateDay({ ...base, rule: night, punches, now: new Date('2026-10-08T00:00:00Z') }).workedMinutes).toBe(435);
    });

    it('a fixed check-out clips the break to the worked span; the other modes show the same net time', () => {
      // Check-out fixed to 18:00 with a break from 17:30 never ended: the break ends at 18:00, so 540 - 30 = 510.
      expect(evaluateDay({ ...base, punches: [p('in', '09:00'), p('break_start', '17:30')], fix: { kind: 'missed_out', inMinute: null, outMinute: 18 * 60 } }).workedMinutes).toBe(510);
      expect(evaluateDay({ ...base, mode: 'assumed_present', punches: [p('in', '09:30'), p('break_start', '13:00'), p('break_end', '13:45'), p('out', '18:30')] }).workedMinutes).toBe(495);
    });
  });

  it('an approved regularisation fills the missing check-out', () => {
    const r = evaluateDay({ ...base, punches: [{ at: at('09:31'), kind: 'in' }], fix: { kind: 'missed_out', inMinute: null, outMinute: 18 * 60 + 10 } });
    expect(r).toMatchObject({ status: 'present', regularised: true });
    expect(evaluateDay({ ...base, fix: { kind: 'full_day', inMinute: null, outMinute: null } }).status).toBe('present');
  });
});
