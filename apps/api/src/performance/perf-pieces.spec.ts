import { coachNudges, COACH_LOOKS_AT, type CoachSignals } from './b3-rules';
import { ImportFileProblem, MAX_IMPORT_ROWS, parseCompetencyCsv } from './competency-import';
import { monthBefore, monthOf } from './home.service';
import { extendAgainEnd, extendAgainProblem, extensionProblem } from './pip-rules';
import { dayText } from './review-pdf';

// The "live, gap" pieces of 3 Nov 2026: PRF-01 monthly snapshot months, PRF-05/06 PDF dates, PRF-12 extend after
// "not met", PRF-14 competency import and PRF-16 coach signals from Time and People.

describe('PRF-01 snapshot months', () => {
  it('the month of a day and the month before, across a year end', () => {
    expect(monthOf('2026-11-03')).toBe('2026-11-01');
    expect(monthBefore('2026-11-30')).toBe('2026-10-01');
    expect(monthBefore('2026-01-01')).toBe('2025-12-01');
    expect(monthBefore('2024-03-01')).toBe('2024-02-01');
  });
});

describe('PRF-05 / PRF-06 PDF dates', () => {
  it('"3 Nov 2026" for a date, and for a timestamp in IST', () => {
    expect(dayText('2026-11-03')).toBe('3 Nov 2026');
    expect(dayText('2026-11-02T20:00:00.000Z')).toBe('3 Nov 2026');
    expect(dayText('2024-02-29')).toBe('29 Feb 2024');
  });
});

describe('PRF-12 extend again after "not met" (founder answer a)', () => {
  it('only a plan not met, without an exit case, once', () => {
    expect(extendAgainProblem({ status: 'not_met', exitCaseId: null, reextended: false })).toBeNull();
    expect(extendAgainProblem({ status: 'active', exitCaseId: null, reextended: false })).toMatch(/not met/);
    expect(extendAgainProblem({ status: 'met', exitCaseId: null, reextended: false })).toMatch(/not met/);
    expect(extendAgainProblem({ status: 'not_met', exitCaseId: 'x', reextended: false })).toMatch(/exit case/);
    expect(extendAgainProblem({ status: 'not_met', exitCaseId: null, reextended: true })).toMatch(/already extended/);
  });
  it('from today, or from the planned end when that is later', () => {
    expect(extendAgainEnd('2026-10-31', '2026-11-03', 30)).toBe('2026-12-03');
    expect(extendAgainEnd('2026-11-10', '2026-11-03', 30)).toBe('2026-12-10');
    expect(extendAgainEnd('2026-11-03', '2026-11-03', 15)).toBe('2026-11-18');
  });
  it('a plan extended again is never extended through the outcome', () => {
    expect(extensionProblem('2026-12-03', '2026-12-20', true)).toMatch(/once/);
  });
});

describe('PRF-14 competency import', () => {
  const head = 'name,group,description,levels,roles';
  it('reads good rows: levels and roles split on "|"', () => {
    const { rows, problems } = parseCompetencyCsv(`﻿${head}\nFood safety,Functional,Plant hygiene,Follows | Applies | Improves,Quality Inspector=2 | Plant Supervisor=3\nOwnership,core,,Learns|Owns,`);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: 'Food safety', group: 'functional', description: 'Plant hygiene', levels: ['Follows', 'Applies', 'Improves'], roles: [{ designation: 'Quality Inspector', level: 2 }, { designation: 'Plant Supervisor', level: 3 }] },
      { line: 3, name: 'Ownership', group: 'core', description: null, levels: ['Learns', 'Owns'], roles: [] },
    ]);
  });
  it('checks every row and lists each problem with its line', () => {
    const csv = [head, 'X,core,,A1|B1,', 'Delivery,sales,,Good|Better,', 'Coaching,leadership,,Only one,', 'Planning,core,,Plan|Plan more,Inspector=3', 'Planning,core,,P1|P2,', 'Speed,core,,S1|S2,Inspector'].join('\n');
    const { rows, problems } = parseCompetencyCsv(csv);
    expect(rows).toEqual([]);
    expect(problems.map((p) => [p.line, p.problems.join(' ')])).toEqual([
      [2, 'Give a name of 2 to 120 characters.'],
      [3, 'Group must be core, functional or leadership.'],
      [4, 'Give 2 to 10 levels, separated by "|".'],
      [5, 'The level for Inspector must be from 1 to 2.'],
      [6, 'The same name is on line 5.'],
      [7, 'Write each role as "Designation=level": "Inspector" is not.'],
    ]);
  });
  it('refuses a file it cannot use as a whole', () => {
    expect(() => parseCompetencyCsv('name,group,levels')).toThrow(ImportFileProblem);
    expect(() => parseCompetencyCsv('name,group,colour\nA,core,red')).toThrow(/Unknown column: colour/);
    expect(() => parseCompetencyCsv('name,group\nAb,core')).toThrow(/Missing column: levels/);
    expect(() => parseCompetencyCsv('name,name,levels\nA,B,C')).toThrow(/twice/);
    expect(() => parseCompetencyCsv(`${head}\n"broken,core`)).toThrow(/not valid CSV/);
    const many = [head, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Skill ${i},core,,A1|B1,`)].join('\n');
    expect(() => parseCompetencyCsv(many)).toThrow(/At most 200/);
    expect(parseCompetencyCsv([head, ...Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `Skill ${i},core,,A1|B1,`)].join('\n')).rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});

describe('PRF-16 coach signals from Time and People (counts only)', () => {
  const base: CoachSignals = { employeeId: 'e1', name: 'Rohit Bhat', feedbackDays: 10, lastOneOnOneDays: 10, plannedOverdueDays: 0, goalsOff: [] };
  it('unused leave above 12 days', () => {
    expect(coachNudges([{ ...base, leaveBalance: 12 }])).toEqual([]);
    expect(coachNudges([{ ...base, leaveBalance: null }])).toEqual([]);
    expect(coachNudges([{ ...base, leaveBalance: 14.5 }])[0]).toMatchObject({ signal: '14 leave days unused this year.', action: 'Suggest leave', key: 'e1:leave' });
  });
  it('overtime in each of the last 3 weeks', () => {
    expect(coachNudges([{ ...base, overtimeWeeks: 2 }])).toEqual([]);
    expect(coachNudges([{ ...base, overtimeWeeks: 3 }])[0]).toMatchObject({ signal: 'Overtime 3 weeks running.', action: 'Book 1:1' });
  });
  it('a new joiner’s open onboarding tasks', () => {
    expect(coachNudges([{ ...base, onboardingOpen: 0 }])).toEqual([]);
    expect(coachNudges([{ ...base, onboardingOpen: 1 }])[0].signal).toBe('New joiner: 1 onboarding task still open.');
    expect(coachNudges([{ ...base, onboardingOpen: 3 }])[0]).toMatchObject({ signal: 'New joiner: 3 onboarding tasks still open.', action: 'View tasks', link: '/yx/people/my-tasks' });
  });
  it('one nudge names every signal; the first decides the action; the card says what it looks at', () => {
    const [n] = coachNudges([{ ...base, feedbackDays: 50, leaveBalance: 20, overtimeWeeks: 3, onboardingOpen: 2 }]);
    expect(n).toMatchObject({ key: 'e1:fb+leave+ot+onb', action: 'Give feedback' });
    expect(COACH_LOOKS_AT).toEqual(['No feedback given in 6 weeks', '1:1s due or overdue', 'Unused leave balance above 12 days (counts only)', 'Overtime 3 weeks running', 'Goals off track or at risk', 'New joiners’ open onboarding tasks']);
  });
});
