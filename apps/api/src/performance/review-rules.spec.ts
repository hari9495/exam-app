import { DEFAULT_RULES, eligibilityFor, scoreReview, stagesProblem } from './review-rules';

// PM-4.02 / PM-4.04 (J11, YX-PERF-02, YX-PERF-21).
const FY = { periodFrom: '2026-04-01', periodTo: '2027-03-31', today: '2027-04-10', exitedOn: null, protectedLeave: false };

describe('review eligibility (J11)', () => {
  it('a February joiner is left out with a 3-month cut-off', () => {
    expect(eligibilityFor({ ...FY, joinedOn: '2027-02-01' }, DEFAULT_RULES)).toMatchObject({ rule: 'excluded_cutoff', reviewed: false, eligibleMonths: 2 });
  });
  it('a July joiner is reviewed for 9 of 12 months', () => {
    expect(eligibilityFor({ ...FY, joinedOn: '2026-07-01' }, DEFAULT_RULES)).toEqual({ rule: 'included', eligibleMonths: 9, proration: 0.75, reviewed: true });
  });
  it('maternity leave counts as served and is marked, never a reason to leave out (YX-PERF-21)', () => {
    expect(eligibilityFor({ ...FY, joinedOn: '2020-01-01', protectedLeave: true }, DEFAULT_RULES)).toEqual({ rule: 'protected_leave', eligibleMonths: 12, proration: 1, reviewed: true });
  });
  it('leavers are closed without a rating unless the company rates them', () => {
    const left = { ...FY, joinedOn: '2020-01-01', exitedOn: '2026-12-31' };
    expect(eligibilityFor(left, DEFAULT_RULES)).toMatchObject({ rule: 'leaver', reviewed: false, eligibleMonths: 9 });
    expect(eligibilityFor(left, { ...DEFAULT_RULES, rateLeavers: true })).toMatchObject({ rule: 'leaver', reviewed: true });
  });
  it('people outside the period are not in the cycle', () => {
    expect(eligibilityFor({ ...FY, joinedOn: '2027-04-02' }, DEFAULT_RULES)).toBeNull();
    expect(eligibilityFor({ ...FY, joinedOn: '2020-01-01', exitedOn: '2026-03-31' }, DEFAULT_RULES)).toBeNull();
  });
});

describe('stages', () => {
  it('need the manager stage, in order, with deadlines in order', () => {
    expect(stagesProblem([{ key: 'self', dueOn: '2027-04-20' }], '2027-04-10')).toMatch(/manager stage/);
    expect(stagesProblem([{ key: 'manager', dueOn: '2027-04-30' }, { key: 'self', dueOn: '2027-05-05' }], '2027-04-10')).toMatch(/self, manager/);
    expect(stagesProblem([{ key: 'self', dueOn: '2027-04-30' }, { key: 'manager', dueOn: '2027-04-20' }], '2027-04-10')).toMatch(/due before/);
    expect(stagesProblem([{ key: 'self', dueOn: '2027-04-20', optional: true }, { key: 'manager', dueOn: '2027-04-30' }, { key: 'skip', dueOn: '2027-05-10' }], '2027-04-10')).toBeNull();
  });
});

describe('scoring (§9.1)', () => {
  const sections = [
    { id: 'g', title: 'Goals', weight: 60, rated: true, questionIds: ['q1', 'q2'] },
    { id: 'c', title: 'Competencies', weight: 40, rated: true, questionIds: ['q3'] },
    { id: 'o', title: 'Comments', weight: 0, rated: false, questionIds: ['q4'] },
  ];
  it('weights section averages', () => {
    expect(scoreReview('weighted', sections, { q1: { rating: 4 }, q2: { rating: 5 }, q3: { rating: 3 } }, null)).toEqual({ sectionScores: { g: 4.5, c: 3 }, excluded: [], finalScore: 3.9 });
  });
  it('excludes and names a section with no ratings, never scoring it 0 (YX-PERF-02)', () => {
    expect(scoreReview('weighted', sections, { q1: { rating: 4 }, q2: { rating: 4, text: 'ok' } }, null)).toEqual({ sectionScores: { g: 4 }, excluded: ['Competencies'], finalScore: 4 });
  });
  it('manager-overall takes the overall rating', () => {
    expect(scoreReview('manager_overall', sections, { q1: { rating: 2 } }, 4).finalScore).toBe(4);
  });
});
