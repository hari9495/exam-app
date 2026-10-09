import { DayRule, evaluateDay, instantAt } from './time-maths';
import { compOffDays, daysWorked, eligibilityWindow, maternityChecks, mondayOf, overlapsNight, otSettlement, overtimeFor, patternCell, payOfDay, quarterOf, resolveDay, restConflicts, scheduledMinutes, workOnForPunch, type ShiftTimes } from './time-rules';

const Z = 'Asia/Kolkata';
const rule = (start: number, end: number): DayRule => ({ shiftStart: start, shiftEnd: end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 });
const shift = (id: string, start: number, end: number): ShiftTimes => ({ ...rule(start, end), shiftId: id, name: id, night: end < start });
const M = shift('M', 360, 840); // 6 am – 2 pm
const A = shift('A', 840, 1320); // 2 pm – 10 pm
const N = shift('N', 1320, 360); // 10 pm – 6 am, across midnight

describe('shift patterns (Q2)', () => {
  it('a 4-on / 2-off cycle from 1 Oct places offs correctly for 60 days (acceptance, YX-AT-02)', () => {
    const p = { kind: 'cycle' as const, cycle: ['G', 'G', 'G', 'G', null, null] };
    const offs: string[] = [];
    for (let k = 0; k < 60; k++) {
      const on = new Date(Date.UTC(2026, 9, 1 + k)).toISOString().slice(0, 10);
      if (patternCell(p, '2026-10-01', 0, on) === null) offs.push(on);
    }
    expect(offs.slice(0, 4)).toEqual(['2026-10-05', '2026-10-06', '2026-10-11', '2026-10-12']);
    expect(offs).toHaveLength(20);
    // Before the start date the cycle runs backwards consistently (never a negative index).
    expect(patternCell(p, '2026-10-01', 0, '2026-09-30')).toBeNull();
    expect(patternCell(p, '2026-10-01', 0, '2026-09-26')).toBe('G');
  });

  it('a 3-shift rotation with crew offsets puts each crew on a different shift the same day', () => {
    const week = (s: string) => [s, s, s, s, s, s, null];
    const p = { kind: 'cycle' as const, cycle: [...week('M'), ...week('A'), ...week('N')] };
    const on = '2026-10-05';
    expect([0, 7, 14].map((o) => patternCell(p, on, o, on))).toEqual(['M', 'A', 'N']);
    expect(patternCell(p, on, 0, '2026-10-12')).toBe('A');
    expect(patternCell(p, on, 0, '2026-10-11')).toBeNull();
  });

  it('a weekly pattern follows the weekday', () => {
    const p = { kind: 'weekly' as const, cycle: ['G', 'G', 'G', 'G', 'G', 'H', null] };
    expect(patternCell(p, '2026-01-01', 3, '2026-10-10')).toBe('H'); // Saturday; the offset never moves a weekly pattern
    expect(patternCell(p, '2026-01-01', 0, '2026-10-11')).toBeNull();
  });

  it('resolves roster over pattern over location (Q1)', () => {
    const loc = { rule: shift('LOC', 570, 1110), weeklyOff: false };
    const by = (id: string) => ({ M, A, N })[id as 'M'] ?? null;
    expect(resolveDay({ roster: { shiftId: null, isOff: true }, pattern: 'M', location: loc, shiftOn: by })).toMatchObject({ shift: null, weeklyOff: true, source: 'roster' });
    expect(resolveDay({ roster: { shiftId: 'N', isOff: false }, pattern: null, location: loc, shiftOn: by }).shift?.shiftId).toBe('N');
    expect(resolveDay({ roster: null, pattern: null, location: loc, shiftOn: by })).toMatchObject({ weeklyOff: true, source: 'pattern' });
    expect(resolveDay({ roster: null, pattern: undefined, location: { ...loc, weeklyOff: true }, shiftOn: by })).toMatchObject({ weeklyOff: true, source: 'location' });
    // A shift with no version in force falls back to the location's shift.
    expect(resolveDay({ roster: null, pattern: 'X', location: loc, shiftOn: by }).shift?.shiftId).toBe('LOC');
  });

  it('expects a shift less its fixed break', () => {
    expect(scheduledMinutes(M)).toBe(450);
    expect(scheduledMinutes(rule(600, 840))).toBe(240);
  });
});

describe('the night-shift day boundary (YX-AT-13)', () => {
  const at = (on: string, minute: number) => instantAt(on, Z, minute);
  const nightThenOff = (on: string) => (on === '2026-10-05' ? N : null);

  it('a check-out at 6:05 am after a night shift belongs to the night it started', () => {
    expect(workOnForPunch(at('2026-10-06', 365), Z, 'out', nightThenOff)).toBe('2026-10-05');
  });

  it('a check-in at 9:55 pm starts tonight’s night shift', () => {
    expect(workOnForPunch(at('2026-10-05', 1315), Z, 'in', nightThenOff)).toBe('2026-10-05');
  });

  it('long after the night shift ended, a punch is today', () => {
    expect(workOnForPunch(at('2026-10-06', 13 * 60), Z, 'in', nightThenOff)).toBe('2026-10-06');
  });

  it('a check-in for today’s morning shift is today even right after a night shift', () => {
    const nightThenMorning = (on: string) => (on === '2026-10-05' ? N : M);
    expect(workOnForPunch(at('2026-10-06', 350), Z, 'in', nightThenMorning)).toBe('2026-10-06');
    expect(workOnForPunch(at('2026-10-06', 350), Z, 'out', nightThenMorning)).toBe('2026-10-05');
  });

  it('day shifts never move', () => {
    expect(workOnForPunch(at('2026-10-06', 30), Z, 'out', () => M)).toBe('2026-10-06');
  });
});

describe('roster conflicts (YX-AT-07) and the night window (YX-AT-25)', () => {
  it('flags too little rest and overlaps', () => {
    const c = restConflicts(
      [
        { on: '2026-10-05', shift: N },
        { on: '2026-10-06', shift: M },
        { on: '2026-10-07', shift: A },
      ],
      11 * 60,
    );
    expect(c).toEqual([{ on: '2026-10-06', kind: 'rest', message: 'Only 0 h rest after the shift before (at least 11 h)' }]);
    expect(restConflicts([{ on: '2026-10-05', shift: N }, { on: '2026-10-06', shift: shift('E', 300, 600) }], 0)[0].kind).toBe('overlap');
    expect(restConflicts([{ on: '2026-10-05', shift: A }, { on: '2026-10-06', shift: null }, { on: '2026-10-07', shift: M }], 11 * 60)).toEqual([]);
  });

  it('knows which shifts touch 7 pm – 6 am', () => {
    const w = { start: 1140, end: 360 };
    expect(overlapsNight(N, w)).toBe(true);
    expect(overlapsNight(A, w)).toBe(true); // 2 pm – 10 pm runs past 7 pm
    expect(overlapsNight(M, w)).toBe(false); // 6 am – 2 pm
    expect(overlapsNight(shift('E', 300, 600), w)).toBe(true); // 5 am start
    expect(overlapsNight(shift('G', 570, 1110), w)).toBe(false); // 9:30 – 6:30 pm
  });
});

describe('overtime maths (Q7, YX-AT-04)', () => {
  const r = { minMinutes: 30, roundMinutes: 15, dailyCapMinutes: null };
  const law = { dailyMaxWorkMinutes: 600, quarterlyOtMinutes: 7500 };
  it('7 minutes past the end is no overtime (acceptance)', () => {
    expect(overtimeFor({ category: 'normal', workedMinutes: 457, scheduledMinutes: 450, rule: r, statutory: law, quarterUsedMinutes: 0 })).toEqual({ raw: 7, eligible: 0, payable: 0, overCap: 0 });
  });
  it('rounds down to the unit above the minimum', () => {
    expect(overtimeFor({ category: 'normal', workedMinutes: 450 + 104, scheduledMinutes: 450, rule: r, statutory: law, quarterUsedMinutes: 0 }).eligible).toBe(90);
  });
  it('caps at the law’s day (10 hours of work) and the quarter; the rest is flagged', () => {
    const day = overtimeFor({ category: 'normal', workedMinutes: 450 + 240, scheduledMinutes: 450, rule: r, statutory: law, quarterUsedMinutes: 0 });
    expect(day).toEqual({ raw: 240, eligible: 240, payable: 150, overCap: 90 });
    const quarter = overtimeFor({ category: 'normal', workedMinutes: 450 + 120, scheduledMinutes: 450, rule: r, statutory: law, quarterUsedMinutes: 7440 });
    expect(quarter).toMatchObject({ payable: 60, overCap: 60 });
    expect(overtimeFor({ category: 'normal', workedMinutes: 600, scheduledMinutes: 450, rule: { ...r, dailyCapMinutes: 60 }, statutory: law, quarterUsedMinutes: 0 })).toMatchObject({ eligible: 150, payable: 60, overCap: 90 });
  });
  it('counts every minute worked on a weekly off or holiday', () => {
    expect(overtimeFor({ category: 'holiday', workedMinutes: 480, scheduledMinutes: 450, rule: r, statutory: law, quarterUsedMinutes: 0 })).toMatchObject({ raw: 480, eligible: 480, payable: 480 });
  });
  it('turns approved minutes into comp-off days', () => {
    expect([compOffDays(200, 240, 480), compOffDays(240, 240, 480), compOffDays(500, 240, 480)]).toEqual([0, 0.5, 1]);
  });
  it('knows the quarter', () => {
    expect(quarterOf('2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });
});

describe('factory overtime is paid (founder decision 9 Oct 2026)', () => {
  it('covered by the Factories Act: always paid, never below the legal rate; otherwise the rule decides', () => {
    expect(otSettlement({ settle: 'comp_off', rate: 1.5 }, { covered: true, legalRate: 2 })).toEqual({ settle: 'pay', rate: 2 });
    expect(otSettlement({ settle: 'pay', rate: 2.5 }, { covered: true, legalRate: 2 })).toEqual({ settle: 'pay', rate: 2.5 });
    expect(otSettlement({ settle: 'comp_off', rate: 1.5 }, { covered: false, legalRate: 2 })).toEqual({ settle: 'comp_off', rate: 1.5 });
  });
});

describe('maternity eligibility (YX-LV-10)', () => {
  const v = { maternityWeeks: 26, maternityWeeksThirdChild: 12, beforeDeliveryWeeks: 8, eligibilityDaysWorked: 80 };
  it('needs 80 days worked in the 12 months before the expected date', () => {
    const base = { values: v, maternityCase: 'birth' as const, expectedOn: '2027-01-20', from: '2027-01-01', to: '2027-06-30' };
    expect(maternityChecks({ ...base, worked: 80 })).toEqual([]);
    expect(maternityChecks({ ...base, worked: 79 })[0]).toBe('Maternity leave needs at least 80 days worked in the 12 months before the expected date. Our records show 79. Ask HR if days are missing.');
    expect(eligibilityWindow('2027-01-20')).toEqual({ from: '2026-01-20', to: '2027-01-19' });
  });
  it('limits the weeks by case and the start to 8 weeks before delivery', () => {
    const base = { values: v, expectedOn: '2027-03-01', worked: 200 };
    expect(maternityChecks({ ...base, maternityCase: 'birth', from: '2026-12-01', to: '2027-05-31' })).toEqual(['Maternity leave can start at most 8 weeks before the expected date of delivery.']);
    expect(maternityChecks({ ...base, maternityCase: 'adoption', from: '2027-03-01', to: '2027-06-30' })[0]).toMatch(/at most 12 weeks/);
    expect(maternityChecks({ ...base, maternityCase: 'miscarriage', from: '2027-03-01', to: '2027-04-11' })).toEqual([]);
  });
  it('counts present days, half days and paid holidays as days worked', () => {
    expect(daysWorked(['present', 'half_day', 'holiday', 'absent', 'leave', 'weekly_off'])).toBe(3);
  });
});

describe('what a day pays (§B6)', () => {
  it('pays worked days, paid leave, holidays and offs; LOP for unpaid leave and absence', () => {
    expect(payOfDay({ status: 'present', leavePart: null, leavePaid: null })).toEqual({ paid: 1, lop: 0 });
    expect(payOfDay({ status: 'leave', leavePart: 'full', leavePaid: false })).toEqual({ paid: 0, lop: 1 });
    expect(payOfDay({ status: 'present', leavePart: 'first', leavePaid: false })).toEqual({ paid: 0.5, lop: 0.5 });
    expect(payOfDay({ status: 'absent', leavePart: 'second', leavePaid: true })).toEqual({ paid: 0.5, lop: 0.5 });
    expect(payOfDay({ status: 'half_day', leavePart: null, leavePaid: null })).toEqual({ paid: 0.5, lop: 0.5 });
    expect(payOfDay({ status: 'missing_out', leavePart: null, leavePaid: null })).toEqual({ paid: 0, lop: 1 });
    expect(payOfDay({ status: 'weekly_off', leavePart: null, leavePaid: null })).toEqual({ paid: 1, lop: 0 });
  });
  it('finds the Monday', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
  });
});

describe('Timesheet mode (D1, YX-AT-09)', () => {
  const base = { on: '2026-10-06', zone: Z, weeklyOff: false, holiday: null, leave: null, punches: [], fix: null, rule: rule(570, 1110), now: new Date('2026-10-08T00:00:00Z') };
  it('the day follows the approved hours; no approved timesheet is the exception', () => {
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: 480 }).status).toBe('present');
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: 300 }).status).toBe('half_day');
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: 0 }).status).toBe('absent');
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: null }).status).toBe('no_timesheet');
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: 480, weeklyOff: true }).status).toBe('weekly_off');
  });
});
