import { afterWorkingDays, overlaps, DEFAULT_RISK_QUESTIONS as Q, DEFAULT_WINDOW as W, freezeCalendar, frozenDaysIn, outsideWindow, parseFreezeDates, questionsProblem, riskOf } from './itsm-rules';

// IST instants: "2026-11-24T21:00" India time.
const at = (s: string) => new Date(`${s}:00+05:30`);
const all = (v: string) => Object.fromEntries(Q.map((q) => [q.id, v]));

describe('ITSM rules (answers 1933, 1936)', () => {
  it('scores the risk: low, medium, high, and payroll that cannot be undone is high', () => {
    expect(riskOf(Q, all('0'))).toBe('low');
    expect(riskOf(Q, { ...all('0'), people: '1', undo: '1', tested: '1' })).toBe('medium');
    expect(riskOf(Q, { ...all('1'), money: '2' })).toBe('high');
    expect(riskOf(Q, { ...all('0'), money: '2', undo: '2' })).toBe('high');
  });

  it('gives no risk while a question is unanswered or an answer is not a choice', () => {
    expect(riskOf(Q, { people: '0' })).toBeNull();
    expect(riskOf(Q, { ...all('0'), money: '1' })).toBeNull();
  });

  it('checks a desk’s own questions', () => {
    expect(questionsProblem(Q)).toBeNull();
    expect(questionsProblem([])).toMatch(/between 1 and 8/);
    expect(questionsProblem([{ ...Q[0] }, { ...Q[0] }])).toMatch(/own short id/);
    expect(questionsProblem([{ ...Q[0], options: [{ value: '3', label: 'x' }, { value: '0', label: 'y' }] }])).toMatch(/0, 1 or 2/);
  });

  it('allows weekday nights and weekends, and refuses office hours', () => {
    expect(outsideWindow(at('2026-11-24T21:00'), at('2026-11-24T23:00'), W)).toBeNull(); // Tuesday night
    expect(outsideWindow(at('2026-11-24T22:00'), at('2026-11-25T05:30'), W)).toBeNull(); // overnight
    expect(outsideWindow(at('2026-11-28T10:00'), at('2026-11-28T14:00'), W)).toBeNull(); // Saturday
    expect(outsideWindow(at('2026-11-24T14:00'), at('2026-11-24T15:00'), W)).toMatch(/outside the change window at 2026-11-24 14:00/);
    expect(outsideWindow(at('2026-11-24T19:00'), at('2026-11-24T21:00'), W)).toMatch(/19:00/);
    expect(outsideWindow(at('2026-11-28T10:00'), at('2026-11-28T14:00'), { ...W, weekends: false })).toMatch(/outside/);
    expect(outsideWindow(at('2026-11-24T23:00'), at('2026-11-24T21:00'), W)).toMatch(/end after/);
  });

  it('freezes the first 7 and last 3 days and the 7th, 15th and 20th', () => {
    expect(frozenDaysIn(at('2026-11-24T21:00'), at('2026-11-24T23:00'), W)).toEqual([]);
    expect(frozenDaysIn(at('2026-11-14T22:00'), at('2026-11-15T02:00'), W)).toEqual([{ date: '2026-11-15', why: 'the 15th, a freeze date' }]);
    expect(frozenDaysIn(at('2026-11-28T10:00'), at('2026-11-28T12:00'), W)[0].why).toMatch(/last 3 days/);
    expect(frozenDaysIn(at('2026-12-03T21:00'), at('2026-12-03T22:00'), W)[0].why).toMatch(/first 7 days/);
    // A window ending exactly at midnight does not touch the next day.
    expect(frozenDaysIn(at('2026-11-14T22:00'), at('2026-11-15T00:00'), W)).toEqual([]);
  });

  it('lists the freeze days for the calendar and reads the freeze dates', () => {
    expect(freezeCalendar('2026-11-13', 4, W).map((d) => d.date)).toEqual(['2026-11-15']);
    expect(parseFreezeDates('20, 7,x,15,15,40')).toEqual([7, 15, 20]);
  });

  it('counts a review due date in working days and finds overlapping windows', () => {
    const weekdays = { zone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080, validFrom: '2020-01-01', validTo: null })), holidays: [{ on: '2026-11-16', halfDay: false }] };
    // Friday 13 Nov + 2 working days: Monday 16th is a holiday, so Tuesday 17th then Wednesday 18th.
    expect(afterWorkingDays(weekdays, at('2026-11-13T10:00'), 2).toISOString()).toBe(new Date('2026-11-18T23:59:59.999+05:30').toISOString());
    expect(afterWorkingDays({ zone: 'Asia/Kolkata', hours: [], holidays: [] }, at('2026-11-13T10:00'), 5).toISOString()).toBe(new Date('2026-11-18T23:59:59.999+05:30').toISOString());
    expect(overlaps({ from: at('2026-11-24T21:00'), to: at('2026-11-24T23:00') }, { from: at('2026-11-24T22:00'), to: at('2026-11-25T01:00') })).toBe(true);
    expect(overlaps({ from: at('2026-11-24T21:00'), to: at('2026-11-24T22:00') }, { from: at('2026-11-24T22:00'), to: at('2026-11-25T01:00') })).toBe(false);
  });
});
