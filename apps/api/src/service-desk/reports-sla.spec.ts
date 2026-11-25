import { weekStarts } from './reports.service';
import { clockState } from './sla.service';

// HLP-05 SLA dashboard rules: a clock at risk from 80 % of the target, missed at 100 %, paused while waiting; weeks are
// India weeks starting Monday.
describe('HLP-05 clock state', () => {
  const c = (usedMinutes: number, paused = false) => ({ usedMinutes, targetMinutes: 100, paused });
  it.each([
    [0, 'on-track'],
    [79, 'on-track'],
    [80, 'at-risk'],
    [99, 'at-risk'],
    [100, 'breached'],
    [101, 'breached'],
  ])('%i of 100 minutes is %s', (used, want) => expect(clockState(c(used))).toBe(want));
  it('a paused clock is paused, even past the target', () => expect(clockState(c(150, true))).toBe('paused'));
  it('a zero target is missed at once', () => expect(clockState({ usedMinutes: 0, targetMinutes: 0, paused: false })).toBe('breached'));
});

describe('HLP-05 weeks', () => {
  it('starts on the Monday of the first day and ends with the week of the last day', () => {
    expect(weekStarts('2026-11-03', '2026-11-03')).toEqual(['2026-11-02']);
    expect(weekStarts('2026-11-01', '2026-11-16')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  });
  it('a Monday starts its own week; a leap day is counted', () => {
    expect(weekStarts('2026-11-02', '2026-11-08')).toEqual(['2026-11-02']);
    expect(weekStarts('2028-02-28', '2028-03-01')).toEqual(['2028-02-28']);
  });
  it('30 days touch 5 or 6 weeks', () => expect(weekStarts('2026-10-05', '2026-11-03').length).toBe(5));
});

describe('HLP-05b at-risk point per desk (clockState)', () => {
  const c = (usedMinutes: number, atRiskPercent?: number) => ({ usedMinutes, targetMinutes: 100, paused: false, atRiskPercent });
  it.each([
    [49, 50, 'on-track'],
    [50, 50, 'at-risk'],
    [89, 90, 'on-track'],
    [90, 90, 'at-risk'],
    [100, 50, 'breached'],
    [60, 50, 'at-risk'],
    [60, 90, 'on-track'],
  ])('%i of 100 minutes with the point at %i %% is %s', (used, point, want) => expect(clockState(c(used, point))).toBe(want));
  it('no point given is the 80 % default', () => {
    expect(clockState(c(79))).toBe('on-track');
    expect(clockState(c(80))).toBe('at-risk');
  });
  it('an odd target rounds the same way as whole numbers (no float error at the line)', () => expect(clockState({ usedMinutes: 42, targetMinutes: 70, paused: false, atRiskPercent: 60 })).toBe('at-risk'));
});
