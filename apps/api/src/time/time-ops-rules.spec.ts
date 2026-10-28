import { evaluateDay, instantAt, type DayInput } from './time-maths';
import { industrialPay, lateMarkDays, overtimeFor, presenceDay } from './time-rules';

// Time ops (29 Oct 2026): HR resolutions, industrial action, presence, late marks and the OT limits at their edges.

const rule = { shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 };
const at = (hhmm: string, on = '2026-10-05') => instantAt(on, 'Asia/Kolkata', Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const base: DayInput = { on: '2026-10-05', zone: 'Asia/Kolkata', mode: 'punch', weeklyOff: false, holiday: null, leave: null, punches: [], fix: null, rule, now: new Date('2026-10-07T00:00:00Z') };

describe('late marks over the free number (attendance.late_marks_free / late_mark_penalty)', () => {
  it('zero, at the limit, one over, and the default of no deduction', () => {
    expect(lateMarkDays(0, 3, 0.5)).toBe(0);
    expect(lateMarkDays(3, 3, 0.5)).toBe(0);
    expect(lateMarkDays(4, 3, 0.5)).toBe(0.5);
    expect(lateMarkDays(7, 3, 1)).toBe(4);
    expect(lateMarkDays(10, 3, 0)).toBe(0);
    expect(lateMarkDays(2, 0, 0.5)).toBe(1);
  });
});

describe('HR resolution of a day (TIM-04)', () => {
  it('absent is final: no longer a missing punch, marked as resolved', () => {
    expect(evaluateDay({ ...base, punches: [{ at: at('09:31'), kind: 'in' }], resolution: { how: 'absent', inMinute: null, outMinute: null } })).toMatchObject({ status: 'absent', regularised: true });
  });
  it('present without times (bulk mark present) is a present day', () => {
    expect(evaluateDay({ ...base, resolution: { how: 'present', inMinute: null, outMinute: null } })).toMatchObject({ status: 'present', regularised: true, lateMinutes: null });
  });
  it('present with times works the day out from them, late mark included; it outranks the employee fix', () => {
    const r = evaluateDay({ ...base, punches: [{ at: at('09:55'), kind: 'in' }], fix: { kind: 'full_day', inMinute: null, outMinute: null }, resolution: { how: 'present', inMinute: 585, outMinute: 1110 } });
    expect(r).toMatchObject({ status: 'present', lateMinutes: 5, workedMinutes: 495, regularised: true });
  });
  it('times too short for a full day give a half day', () => {
    expect(evaluateDay({ ...base, resolution: { how: 'present', inMinute: 570, outMinute: 870 } }).status).toBe('half_day');
  });
  it('in the other modes a resolution makes the day present', () => {
    expect(evaluateDay({ ...base, mode: 'timesheet', timesheetMinutes: null, resolution: { how: 'present', inMinute: 570, outMinute: 1110 } }).status).toBe('present');
  });
  it('weekly offs, holidays and full-day leave stay as they are', () => {
    expect(evaluateDay({ ...base, weeklyOff: true, resolution: { how: 'absent', inMinute: null, outMinute: null } }).status).toBe('weekly_off');
    expect(evaluateDay({ ...base, leave: 'full', resolution: { how: 'present', inMinute: null, outMinute: null } }).status).toBe('leave');
  });
});

describe('industrial action (TIM-37)', () => {
  it('a day of the event is marked with its kind, not absence', () => {
    expect(evaluateDay({ ...base, action: 'strike' }).status).toBe('strike');
    expect(evaluateDay({ ...base, action: 'layoff' }).status).toBe('layoff');
  });
  it('a worker who checked in worked; weekly offs, holidays and leave inside stay', () => {
    expect(evaluateDay({ ...base, action: 'strike', punches: [{ at: at('09:30'), kind: 'in' }, { at: at('18:30'), kind: 'out' }] }).status).toBe('present');
    expect(evaluateDay({ ...base, action: 'lockout', weeklyOff: true }).status).toBe('weekly_off');
    expect(evaluateDay({ ...base, action: 'lockout', holiday: { name: 'Diwali', halfDay: false, openHalf: 'first' } }).status).toBe('holiday');
    expect(evaluateDay({ ...base, action: 'lockout', leave: 'full' }).status).toBe('leave');
  });
  it('pay by kind and legality', () => {
    expect(industrialPay('strike', 'legal')).toEqual({ paid: 0, lop: 1, layoff: 0, held: 0 });
    expect(industrialPay('strike', 'illegal')).toEqual({ paid: 0, lop: 1, layoff: 0, held: 0 });
    expect(industrialPay('lockout', 'legal')).toEqual({ paid: 0, lop: 1, layoff: 0, held: 0 });
    expect(industrialPay('lockout', 'illegal')).toEqual({ paid: 1, lop: 0, layoff: 0, held: 0 });
    expect(industrialPay('layoff', 'legal')).toEqual({ paid: 0, lop: 1, layoff: 1, held: 0 });
    expect(industrialPay('layoff', 'illegal')).toEqual({ paid: 1, lop: 0, layoff: 0, held: 0 });
    for (const k of ['strike', 'lockout', 'layoff'] as const) expect(industrialPay(k, 'undetermined')).toEqual({ paid: 0, lop: 0, layoff: 0, held: 1 });
  });
});

describe('presence on a work-from-home day (TIM-36)', () => {
  it('active time runs from each active signal to the next signal; idle and offline do not count', () => {
    const p = presenceDay([
      { at: at('09:10'), state: 'active' },
      { at: at('13:00'), state: 'idle' },
      { at: at('13:30'), state: 'active' },
      { at: at('18:09'), state: 'offline' },
    ]);
    expect(p).toMatchObject({ first: at('09:10'), last: at('18:09'), activeMinutes: 230 + 279 });
  });
  it('no activity is no presence', () => {
    expect(presenceDay([])).toBeNull();
    expect(presenceDay([{ at: at('09:00'), state: 'offline' }])).toBeNull();
  });
  it('it decides the day against the thresholds when there are no punches; punches win', () => {
    const presence = { first: at('09:50'), last: at('13:40'), activeMinutes: 250 };
    expect(evaluateDay({ ...base, wfh: true, presence })).toMatchObject({ status: 'half_day', workedMinutes: 250, lateMinutes: 10 });
    expect(evaluateDay({ ...base, wfh: true, presence: { ...presence, activeMinutes: 480 } }).status).toBe('present');
    expect(evaluateDay({ ...base, wfh: true, presence: { ...presence, activeMinutes: 100 } }).status).toBe('absent');
    expect(evaluateDay({ ...base, wfh: true, presence, punches: [{ at: at('09:30'), kind: 'in' }] }).status).toBe('present');
  });
});

describe('overtime limits at the edges (Factories Act s.64/65, P07: 10 h a day, 125 h a quarter; 15-minute steps)', () => {
  const ot = (worked: number, used = 0, cap: number | null = null) => overtimeFor({ category: 'normal', workedMinutes: worked, scheduledMinutes: 480, rule: { minMinutes: 30, roundMinutes: 15, dailyCapMinutes: cap }, statutory: { dailyMaxWorkMinutes: 600, quarterlyOtMinutes: 7500 }, quarterUsedMinutes: used });
  it('below the minimum is none; 15-minute steps round down', () => {
    expect(ot(509).eligible).toBe(0);
    expect(ot(510).eligible).toBe(30);
    expect(ot(524).eligible).toBe(30);
    expect(ot(525).eligible).toBe(45);
  });
  it('the daily law limit and the quarter: at the limit and one step over', () => {
    expect(ot(600)).toMatchObject({ payable: 120, overCap: 0 });
    expect(ot(615)).toMatchObject({ payable: 120, overCap: 15 });
    expect(ot(540, 7500 - 60)).toMatchObject({ payable: 60, overCap: 0 });
    expect(ot(555, 7500 - 60)).toMatchObject({ payable: 60, overCap: 15 });
    expect(ot(600, 7500)).toMatchObject({ payable: 0, overCap: 120 });
  });
  it('a company daily cap below the law', () => {
    expect(ot(600, 0, 60)).toMatchObject({ payable: 60, overCap: 60 });
  });
});

describe('night minutes inside the 7 pm to 6 am window (TIM-16 register)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { nightMinutes } = require('./attendance-ops.service') as typeof import('./attendance-ops.service');
  it('a full night shift, a day shift, and one that touches the window at each end', () => {
    expect(nightMinutes(1320, 360)).toBe(480);
    expect(nightMinutes(540, 1080)).toBe(0);
    expect(nightMinutes(840, 1320)).toBe(180);
    expect(nightMinutes(300, 780)).toBe(60);
  });
});
