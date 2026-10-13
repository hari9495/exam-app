import { checkinDates, extensionProblem, isMissed, pausedEnd, planProblem } from './pip-rules';

describe('PIP rules (PM8)', () => {
  it('check-ins come every n days and always on the last day', () => {
    expect(checkinDates('2026-01-01', '2026-01-31', 14)).toEqual(['2026-01-15', '2026-01-29', '2026-01-31']);
    expect(checkinDates('2026-01-01', '2026-01-29', 14)).toEqual(['2026-01-15', '2026-01-29']);
    expect(checkinDates('2026-01-01', '2026-03-01', 14, '2026-01-31')).toEqual(['2026-02-12', '2026-02-26', '2026-03-01']);
  });

  it('protected leave moves the end by every day inside the plan, including leave the move runs into', () => {
    expect(pausedEnd('2026-01-01', '2026-01-30', [])).toEqual({ endsOn: '2026-01-30', pausedDays: 0 });
    expect(pausedEnd('2026-01-01', '2026-01-30', [{ from: '2026-01-11', to: '2026-01-20' }])).toEqual({ endsOn: '2026-02-09', pausedDays: 10 });
    // leave before the start does not count; leave just after the planned end counts once the end moves into it
    expect(pausedEnd('2026-01-01', '2026-01-30', [{ from: '2025-12-01', to: '2026-01-05' }, { from: '2026-02-01', to: '2026-02-03' }])).toEqual({ endsOn: '2026-02-07', pausedDays: 8 });
    expect(pausedEnd('2026-01-01', '2026-01-30', [{ from: '2026-03-01', to: '2026-03-10' }]).pausedDays).toBe(0);
  });

  it('a plan has an allowed length, a sensible rhythm and a start not in the past', () => {
    const ok = { lengthDays: 60, checkinEveryDays: 14, startsOn: '2026-01-05' };
    expect(planProblem(ok, [30, 60, 90], '2026-01-01')).toBeNull();
    expect(planProblem({ ...ok, lengthDays: 45 }, [30, 60, 90], '2026-01-01')).toMatch(/30, 60, 90/);
    expect(planProblem({ ...ok, checkinEveryDays: 3 }, [30, 60, 90], '2026-01-01')).toMatch(/every 7/);
    expect(planProblem({ ...ok, startsOn: '2025-12-31' }, [30, 60, 90], '2026-01-01')).toMatch(/past/);
  });

  it('an extension happens once, later, by at most 90 days', () => {
    expect(extensionProblem('2026-03-01', '2026-04-01', false)).toBeNull();
    expect(extensionProblem('2026-03-01', '2026-04-01', true)).toMatch(/once/);
    expect(extensionProblem('2026-03-01', '2026-02-01', false)).toMatch(/after/);
    expect(extensionProblem('2026-03-01', '2026-07-01', false)).toMatch(/90/);
  });

  it('a check-in is missed after the grace days, never while on protected leave', () => {
    expect(isMissed('2026-01-10', '2026-01-13', [])).toBe(false);
    expect(isMissed('2026-01-10', '2026-01-14', [])).toBe(true);
    expect(isMissed('2026-01-10', '2026-01-20', [{ from: '2026-01-05', to: '2026-01-15' }])).toBe(false);
  });
});
