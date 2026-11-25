import { hoursText, otPlanProblem, preApprovalCheck } from './ot-plan-rules';

// TIM-07 Ot (Nov 2026): planned overtime and how a claim reads it, with the boundaries.
describe('overtime pre-approval rules', () => {
  const ok = { on: '2026-11-03', today: '2026-11-02', aheadDays: 30, minutes: 120 };
  it('a plan for today or within the window passes', () => {
    expect(otPlanProblem(ok)).toBeNull();
    expect(otPlanProblem({ ...ok, on: '2026-11-02' })).toBeNull();
    expect(otPlanProblem({ ...ok, on: '2026-12-02' })).toBeNull();
  });
  it('yesterday, or one day past the window, is refused on the date', () => {
    expect(otPlanProblem({ ...ok, on: '2026-11-01' })?.field).toBe('on');
    expect(otPlanProblem({ ...ok, on: '2026-12-03' })?.message).toBe('Pick a date in the next 30 days.');
  });
  it('hours: 0.5 to 12 in quarter hours', () => {
    expect(otPlanProblem({ ...ok, minutes: 30 })).toBeNull();
    expect(otPlanProblem({ ...ok, minutes: 720 })).toBeNull();
    expect(otPlanProblem({ ...ok, minutes: 15 })?.message).toBe('Enter at least 0.5 h.');
    expect(otPlanProblem({ ...ok, minutes: 50 })?.message).toMatch(/quarter hours/);
    expect(otPlanProblem({ ...ok, minutes: 735 })?.message).toBe('Enter at most 12 h.');
  });
  it('a claim with a plan says what was pre-approved and any time over it', () => {
    expect(preApprovalCheck('refuse', 120, 90)).toEqual({ refuse: null, note: 'Pre-approved up to 2 h' });
    expect(preApprovalCheck('refuse', 120, 120)).toEqual({ refuse: null, note: 'Pre-approved up to 2 h' });
    expect(preApprovalCheck('flag', 120, 135)).toEqual({ refuse: null, note: 'Pre-approved up to 2 h; 0.25 h more than planned' });
  });
  it('without a plan: refused, flagged or allowed by the company setting', () => {
    expect(preApprovalCheck('refuse', null, 90).refuse).toMatch(/needs approval before the work/);
    expect(preApprovalCheck('flag', null, 90)).toEqual({ refuse: null, note: 'Not pre-approved' });
    expect(preApprovalCheck('allow', null, 90)).toEqual({ refuse: null, note: null });
  });
  it('hours text', () => {
    expect(hoursText(90)).toBe('1.5 h');
    expect(hoursText(75)).toBe('1.25 h');
  });
});
