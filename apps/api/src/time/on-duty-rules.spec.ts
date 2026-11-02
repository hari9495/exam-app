import { evaluateDay, instantAt, type DayInput } from './time-maths';
import { clockText, onDutyProblem, overlaps } from './on-duty-rules';

// TIM-03 / TIM-07 OnDuty (Nov 2026): the request's rules and how an approved on-duty day counts.

describe('on-duty request rules', () => {
  const ok = { on: '2026-11-10', today: '2026-11-02', aheadDays: 30, backDays: 60, inMinute: 510, outMinute: 1080 };
  it('a working day within the window passes', () => {
    expect(onDutyProblem(ok)).toBeNull();
  });
  it('the last day ahead passes; one more is refused', () => {
    expect(onDutyProblem({ ...ok, on: '2026-12-02' })).toBeNull();
    expect(onDutyProblem({ ...ok, on: '2026-12-03' })).toEqual({ field: 'on', message: 'Pick a date in the next 30 days.' });
  });
  it('the last day back passes; one more is refused', () => {
    expect(onDutyProblem({ ...ok, on: '2026-09-03' })).toBeNull();
    expect(onDutyProblem({ ...ok, on: '2026-09-02' })?.message).toMatch(/last 60 days/);
  });
  it('to must be after from, and at least 30 minutes', () => {
    expect(onDutyProblem({ ...ok, outMinute: 510 })).toEqual({ field: 'times', message: 'Enter a To time after From.' });
    expect(onDutyProblem({ ...ok, outMinute: 539 })?.message).toMatch(/at least 30 minutes/);
    expect(onDutyProblem({ ...ok, outMinute: 540 })).toBeNull();
    expect(onDutyProblem({ ...ok, inMinute: -1 })?.field).toBe('times');
    expect(onDutyProblem({ ...ok, outMinute: 1440 })?.field).toBe('times');
  });
  it('overlap: touching ends do not overlap', () => {
    expect(overlaps({ inMinute: 540, outMinute: 780 }, { inMinute: 780, outMinute: 1080 })).toBe(false);
    expect(overlaps({ inMinute: 540, outMinute: 781 }, { inMinute: 780, outMinute: 1080 })).toBe(true);
  });
  it('clock text', () => {
    expect(clockText(510)).toBe('8:30 am');
    expect(clockText(720)).toBe('12:00 pm');
    expect(clockText(0)).toBe('12:00 am');
    expect(clockText(1080)).toBe('6:00 pm');
  });
});

describe('an approved on-duty day in the day engine', () => {
  const rule = { shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 };
  const base: DayInput = { on: '2026-10-05', zone: 'Asia/Kolkata', mode: 'punch', weeklyOff: false, holiday: null, leave: null, punches: [], fix: null, rule, now: new Date('2026-10-07T00:00:00Z') };
  const at = (m: number) => instantAt('2026-10-05', 'Asia/Kolkata', m);
  it('a full day on duty with no punches is present', () => {
    const r = evaluateDay({ ...base, onDuty: { inMinute: 510, outMinute: 1080 } });
    expect(r.status).toBe('present');
    expect(r.workedMinutes).toBe(540);
    expect(r.lateMinutes).toBe(0);
  });
  it('a half day on duty alone is a half day (exactly the half-day hours)', () => {
    expect(evaluateDay({ ...base, onDuty: { inMinute: 570, outMinute: 810 } }).status).toBe('half_day');
    expect(evaluateDay({ ...base, onDuty: { inMinute: 570, outMinute: 809 } }).status).toBe('absent');
  });
  it('morning on duty, afternoon in the office: the day joins up and is present', () => {
    const r = evaluateDay({ ...base, punches: [{ at: at(840), kind: 'in' }, { at: at(1110), kind: 'out' }], onDuty: { inMinute: 570, outMinute: 810 } });
    expect(r.status).toBe('present');
    expect(r.firstIn?.getTime()).toBe(at(570).getTime());
  });
  it('without on duty the same office afternoon is only a half day or less', () => {
    expect(evaluateDay({ ...base, punches: [{ at: at(840), kind: 'in' }, { at: at(1110), kind: 'out' }] }).status).toBe('half_day');
  });
  it('a weekly off stays a weekly off (comp-off is claimed separately)', () => {
    expect(evaluateDay({ ...base, weeklyOff: true, onDuty: { inMinute: 510, outMinute: 1080 } }).status).toBe('weekly_off');
  });
  it('on duty with a half day of leave covers the other half', () => {
    const r = evaluateDay({ ...base, leave: 'first', onDuty: { inMinute: 840, outMinute: 1110 } });
    expect(r.status).toBe('present');
    expect(r.leavePart).toBe('first');
  });
});
