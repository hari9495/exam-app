import { evaluateDay, instantAt, lateFrom, partsOf, type DayInput, type DayRule } from './time-maths';
import { overlapsNight, overtimeFor, scheduledMinutes } from './time-rules';
import { hoursBreaks, shiftKindProblem } from './roster-rules';

// TIM-06 flexi and split shifts (founder answers 2 Nov 2026): the day engine, the expected hours behind the roster checks
// and overtime, and the set-up checks. Fixed shifts must judge exactly as before.

const zone = 'Asia/Kolkata';
const at = (on: string, hhmm: string) => instantAt(on, zone, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const ON = '2026-10-05';
const t = (hhmm: string) => at(ON, hhmm);
const base = (rule: DayRule, extra: Partial<DayInput> = {}): DayInput => ({ on: ON, zone, mode: 'punch', weeklyOff: false, holiday: null, leave: null, punches: [], fix: null, rule, now: new Date('2026-10-07T00:00:00Z'), ...extra });
const ins = (...pairs: [string, string][]) => pairs.flatMap(([a, b]) => [{ at: t(a), kind: 'in' as const }, { at: t(b), kind: 'out' as const }]);

describe('flexi shift: core hours 11:00 to 16:00 inside 08:00 to 20:00', () => {
  const flexi: DayRule = { shiftStart: 480, shiftEnd: 1200, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300, kind: 'flexi', coreStart: 660, coreEnd: 960, otAfterMinutes: 540 };
  const defaults = { late: 'core_start', short: 'shift_hours' } as const;

  it('arrives inside the window before core start: on time, present', () => {
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['10:30', '19:00']) }))).toMatchObject({ status: 'present', lateMinutes: 0, workedMinutes: 480 });
  });
  it('arrives after core start: late from core start less the grace', () => {
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['11:25', '20:00']) }))).toMatchObject({ status: 'present', lateMinutes: 15, workedMinutes: 485 });
  });
  it('arrives within the grace after core start: not late (boundary: core start + grace)', () => {
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['11:10', '20:00']) })).lateMinutes).toBe(0);
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['11:11', '20:00']) })).lateMinutes).toBe(1);
  });
  it('company setting "never late": no late minutes however late', () => {
    expect(evaluateDay(base(flexi, { flexi: { ...defaults, late: 'never' }, punches: ins(['13:00', '20:00']) })).lateMinutes).toBe(0);
  });
  it('short total: below the shift hours is a half day, below the half day is absent', () => {
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['09:00', '15:30']) })).status).toBe('half_day');
    expect(evaluateDay(base(flexi, { flexi: defaults, punches: ins(['10:00', '13:00']) })).status).toBe('absent');
  });
  it('company setting "short only when core hours are missed": in for all core hours is present', () => {
    const core = { ...defaults, short: 'core_hours' } as const;
    expect(evaluateDay(base(flexi, { flexi: core, punches: ins(['10:00', '16:00']) })).status).toBe('present');
    expect(evaluateDay(base(flexi, { flexi: core, punches: ins(['12:00', '17:30']) })).status).toBe('half_day');
  });
  it('a half-day leave on the first half: no late mark', () => {
    expect(evaluateDay(base(flexi, { flexi: defaults, leave: 'first', punches: ins(['14:00', '19:00']) })).lateMinutes).toBe(0);
  });
  it('overtime counts beyond the hours set for the shift (else the full day)', () => {
    expect(scheduledMinutes(flexi)).toBe(540);
    expect(scheduledMinutes({ ...flexi, otAfterMinutes: null })).toBe(480);
    const ot = overtimeFor({ category: 'normal', workedMinutes: 600, scheduledMinutes: scheduledMinutes(flexi), rule: { minMinutes: 30, roundMinutes: 15, dailyCapMinutes: null }, statutory: { dailyMaxWorkMinutes: 600, quarterlyOtMinutes: 7500 }, quarterUsedMinutes: 0 });
    expect(ot).toMatchObject({ raw: 60, eligible: 60, payable: 60 });
  });
  it('late reference is core start, also on the muster', () => {
    expect(lateFrom(flexi, 700)).toBe(660);
    expect(lateFrom(flexi, 700, 'never')).toBeNull();
  });
});

describe('split shift: 07:00 to 11:00 and 17:00 to 21:00', () => {
  const split: DayRule = { shiftStart: 420, shiftEnd: 1260, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 0, breakAboveMinutes: 300, kind: 'split', firstEnd: 660, secondStart: 1020 };

  it('both parts on time: present; minutes inside the gap are not worked', () => {
    expect(evaluateDay(base(split, { punches: ins(['06:58', '11:02'], ['16:55', '21:05']) }))).toMatchObject({ status: 'present', lateMinutes: 0, workedMinutes: 487 });
  });
  it('each part is checked for late on its own', () => {
    expect(evaluateDay(base(split, { punches: ins(['07:15', '11:00'], ['17:20', '21:30']) }))).toMatchObject({ status: 'present', lateMinutes: 15 });
    expect(lateFrom(split, 1040)).toBe(1020);
    expect(lateFrom(split, 430)).toBe(420);
  });
  it('one part missing is a half day (either part)', () => {
    expect(evaluateDay(base(split, { punches: ins(['07:00', '11:00']) })).status).toBe('half_day');
    expect(evaluateDay(base(split, { punches: ins(['17:00', '21:00']) })).status).toBe('half_day');
  });
  it('both parts missing: absent once the day is over, not started before', () => {
    expect(evaluateDay(base(split)).status).toBe('absent');
    expect(evaluateDay(base(split, { now: t('12:00') })).status).toBe('not_started');
    expect(evaluateDay(base(split, { punches: ins(['07:00', '11:00']), now: t('15:00') })).status).toBe('not_started');
  });
  it('one check-in and one check-out across the gap: both parts, the gap taken off', () => {
    expect(evaluateDay(base(split, { punches: ins(['07:00', '21:00']) }))).toMatchObject({ status: 'present', workedMinutes: 480 });
  });
  it('a check-in left open after the day is a missing check-out', () => {
    expect(evaluateDay(base(split, { punches: [...ins(['07:00', '11:00']), { at: t('17:00'), kind: 'in' }] })).status).toBe('missing_out');
  });
  it('time only in the gap is no part: absent', () => {
    expect(evaluateDay(base(split, { punches: ins(['12:00', '15:00']) })).status).toBe('absent');
  });
  it('a regularised day with times counts both parts less the gap', () => {
    expect(evaluateDay(base(split, { fix: { kind: 'wrong_time', inMinute: 420, outMinute: 1260 } }))).toMatchObject({ status: 'present', workedMinutes: 480, regularised: true });
  });
  it('a half-day leave on the first half: only the second part is expected', () => {
    expect(evaluateDay(base(split, { leave: 'first', punches: ins(['17:00', '21:00']) })).status).toBe('present');
    expect(evaluateDay(base(split, { leave: 'first', punches: ins(['07:00', '11:00']) })).status).toBe('absent');
  });
  it('overtime beyond both parts; the gap is not hours', () => {
    expect(scheduledMinutes(split)).toBe(480);
    const ot = overtimeFor({ category: 'normal', workedMinutes: 540, scheduledMinutes: scheduledMinutes(split), rule: { minMinutes: 30, roundMinutes: 15, dailyCapMinutes: null }, statutory: { dailyMaxWorkMinutes: 600, quarterlyOtMinutes: 7500 }, quarterUsedMinutes: 0 });
    expect(ot.raw).toBe(60);
  });
  it('the roster counts both parts as hours, and the whole day (gap included) as the spread-over', () => {
    const limits = { minRestMinutes: 660, dailyMinutes: 540, weeklyMinutes: 2880, spreadMinutes: 630, minWeeklyOffs: 1 };
    const breaks = hoursBreaks([{ on: ON, shift: { ...split, shiftId: 's', name: 'Split', night: false }, employed: true }], limits);
    expect(breaks.map((b) => b.kind)).toEqual(['spread']);
  });
});

describe('night split across midnight: 20:00 to 00:00 and 02:00 to 06:00', () => {
  const night: DayRule = { shiftStart: 1200, shiftEnd: 360, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 0, breakAboveMinutes: 300, kind: 'split', firstEnd: 0, secondStart: 120 };
  const next = (hhmm: string) => at('2026-10-06', hhmm);

  it('parts run into the next morning', () => {
    expect(partsOf(night)).toEqual([[1200, 1440], [1560, 1800]]);
  });
  it('both parts worked across midnight: present, the gap not worked', () => {
    const punches = [{ at: t('19:58'), kind: 'in' as const }, { at: next('00:01'), kind: 'out' as const }, { at: next('01:59'), kind: 'in' as const }, { at: next('06:00'), kind: 'out' as const }];
    expect(evaluateDay(base(night, { punches }))).toMatchObject({ status: 'present', lateMinutes: 0, workedMinutes: 482 });
  });
  it('the second part late after midnight', () => {
    const punches = [{ at: t('20:00'), kind: 'in' as const }, { at: next('00:00'), kind: 'out' as const }, { at: next('02:30'), kind: 'in' as const }, { at: next('06:00'), kind: 'out' as const }];
    expect(evaluateDay(base(night, { punches })).lateMinutes).toBe(20);
  });
});

describe('the night window checks only the parts of a split shift', () => {
  const window = { start: 1140, end: 360 };
  const shape = { shiftStart: 1020, shiftEnd: 540 };
  it('the gap covering the whole night is not night work; a fixed shift over the same hours is', () => {
    expect(overlapsNight({ ...shape, kind: 'split', firstEnd: 1140, secondStart: 360 }, window)).toBe(false);
    expect(overlapsNight(shape, window)).toBe(true);
  });
});

describe('fixed shifts judge exactly as before', () => {
  const fixed: DayRule = { shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 };
  it('late from the start, the break rule, one part', () => {
    expect(evaluateDay(base(fixed, { punches: ins(['09:55', '18:40']) }))).toMatchObject({ status: 'present', lateMinutes: 15, workedMinutes: 495 });
    expect(lateFrom(fixed, 700)).toBe(570);
    expect(scheduledMinutes(fixed)).toBe(510);
    expect(partsOf(fixed)).toEqual([[570, 1110]]);
  });
});

describe('set-up checks for flexi and split shifts', () => {
  it('flexi: core hours are needed and sit inside the shift', () => {
    expect(shiftKindProblem('flexi', { start: 480, end: 1200, coreStart: 660, coreEnd: 960 }, 0)).toBeNull();
    expect(shiftKindProblem('flexi', { start: 480, end: 1200 }, 0)).toMatch(/core hours/);
    expect(shiftKindProblem('flexi', { start: 480, end: 1200, coreStart: 420, coreEnd: 960 }, 0)).toMatch(/inside the shift/);
    expect(shiftKindProblem('flexi', { start: 480, end: 1200, coreStart: 960, coreEnd: 660 }, 0)).toMatch(/inside the shift/);
    expect(shiftKindProblem('flexi', { start: 480, end: 1200, coreStart: 660, coreEnd: 1260 }, 0)).toMatch(/inside the shift/);
    // A flexi window across midnight: core after midnight is inside.
    expect(shiftKindProblem('flexi', { start: 1200, end: 480, coreStart: 0, coreEnd: 240 }, 0)).toBeNull();
  });
  it('split: parts in order, no overlap, the gap at least the company minimum, across midnight allowed', () => {
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 660, secondStart: 1020 }, 60)).toBeNull();
    expect(shiftKindProblem('split', { start: 420, end: 1260 }, 60)).toMatch(/both parts/);
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 900, secondStart: 600 }, 60)).toMatch(/overlap/);
    expect(shiftKindProblem('split', { start: 420, end: 840, firstEnd: 660, secondStart: 900 }, 60)).toMatch(/overlap/);
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 660, secondStart: 690 }, 60)).toBe('The gap between the parts is 30 min. Make it at least 1 h (company setting), or use a fixed shift.');
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 660, secondStart: 720 }, 60)).toBeNull();
    expect(shiftKindProblem('split', { start: 1200, end: 360, firstEnd: 0, secondStart: 120 }, 60)).toBeNull();
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 660, secondStart: 1020, breakMinutes: 30 }, 60)).toMatch(/no break rule/);
  });
  it('the other types carry neither core hours nor parts', () => {
    expect(shiftKindProblem('fixed', { start: 540, end: 1080, coreStart: 600, coreEnd: 900 }, 60)).toMatch(/only for flexi/);
    expect(shiftKindProblem('fixed', { start: 540, end: 1080, firstEnd: 600, secondStart: 900 }, 60)).toMatch(/only for split/);
    expect(shiftKindProblem('split', { start: 420, end: 1260, firstEnd: 660, secondStart: 1020, coreStart: 600, coreEnd: 640 }, 60)).toMatch(/only for flexi/);
    expect(shiftKindProblem('fixed', { start: 540, end: 1080 }, 60)).toBeNull();
  });
});
