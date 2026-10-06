import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AgentPlanCard,
  checkNotice,
  earliestEffective,
  impactTotals,
  payoutReadiness,
  planUndo,
  readOnlyStatus,
  referralStatus,
  trialExtension,
} from './platform-b-kit';
import { JobsErrorsScreen, FeatureRequestsScreen, jobsForPersona, type JobError } from './growth-screens';
import { canMoveRegion, regionsFor } from './region-agent-screens';
import { RUN_STEPS, OT_IMPACT_ROWS, TRANSFER_PLAN, d } from './platform-b-data';

describe('notice of change (P19 YX-RULE-13)', () => {
  it('earliest date is notice + 21 days', () => {
    expect(earliestEffective(d(10, 20))).toEqual(new Date(2026, 10, 10));
  });
  it('refuses too early, allows after the period, and allows a recorded settlement', () => {
    expect(checkNotice(d(11, 1), d(10, 20))).toEqual({ ok: false, reason: 'too-early', earliest: new Date(2026, 10, 10) });
    expect(checkNotice(d(11, 1), d(10, 5)).ok).toBe(true);
    expect(checkNotice(d(11, 1), null)).toEqual({ ok: false, reason: 'no-notice' });
    expect(checkNotice(d(10, 1), null, { exceptionRef: 'Settlement 7' }).ok).toBe(true);
  });
});

describe('impact preview totals', () => {
  it('sums money, averages and counts legal adjustments', () => {
    expect(impactTotals(OT_IMPACT_ROWS)).toEqual({ affected: 5, legalAdjusted: 2, moneyTotal: 5420, moneyAverage: 1084 });
  });
});

describe('undo a run (P22 YX-WFS-10)', () => {
  it('reverses reversible steps in reverse order and lists irreversible ones', () => {
    const p = planUndo(RUN_STEPS);
    expect(p.undo.map((s) => s.id)).toEqual(['s4', 's2', 's1']);
    expect(p.irreversible.map((s) => s.id)).toEqual(['s3', 's5']);
    expect(p.records).toBe(424);
  });
  it('refuses steps whose records changed since the run', () => {
    const p = planUndo(RUN_STEPS.map((s) => (s.id === 's2' ? { ...s, conflict: 'edited' } : s)));
    expect(p.conflicts.map((s) => s.id)).toEqual(['s2']);
    expect(p.undo.map((s) => s.id)).toEqual(['s4', 's1']);
  });
});

describe('trial and billing rules', () => {
  it('allows one 14-day extension, automatic at first value', () => {
    expect(trialExtension({ extensionsUsed: 0, firstValue: true })).toEqual({ allowed: true, automatic: true, days: 14 });
    expect(trialExtension({ extensionsUsed: 0, firstValue: false })).toMatchObject({ allowed: true, automatic: false });
    expect(trialExtension({ extensionsUsed: 1, firstValue: true }).allowed).toBe(false);
  });
  it('counts read-only days and the deletion date', () => {
    const s = readOnlyStatus(d(9, 14), d(9, 29));
    expect(s.day).toBe(15);
    expect(s.daysLeft).toBe(15);
    expect(s.deletion).toEqual(new Date(2026, 9, 14));
    expect(s.reminderToday).toBe(true);
  });
  it('credits referrals only after the first paid month and never within a group', () => {
    const base = { company: 'X', creditAmount: 100, firstPaidMonthSettled: true };
    expect(referralStatus(base)).toBe('earned');
    expect(referralStatus({ ...base, firstPaidMonthSettled: false })).toBe('pending');
    expect(referralStatus({ ...base, sameGroup: true })).toBe('not-credited');
    expect(referralStatus({ ...base, selfReferral: true })).toBe('not-credited');
    expect(referralStatus({ ...base, refunded: true })).toBe('reversed');
  });
  it('payout readiness: grace run, blocks and partial payout', () => {
    const ok = { mandate: 'active' as const, graceRunUsed: true, kyb: 'approved' as const, fundingAccount: true, balance: 200, netPay: 100 };
    expect(payoutReadiness(ok).ready).toBe(true);
    expect(payoutReadiness({ ...ok, mandate: 'pending', graceRunUsed: false }).payrollBlocked).toEqual([]);
    expect(payoutReadiness({ ...ok, mandate: 'pending', graceRunUsed: true }).payrollBlocked).toHaveLength(1);
    expect(payoutReadiness({ ...ok, balance: 60 })).toMatchObject({ short: 40, partialPossible: true, ready: false });
    expect(payoutReadiness({ ...ok, kyb: 'pending', balance: 60 }).partialPossible).toBe(false);
  });
});

describe('regions (P21 / P02 YX-SEC-38)', () => {
  it('offers only live regions that serve the country', () => {
    expect(regionsFor('United Arab Emirates').map((r) => r.code)).toEqual(['ME-AE']);
    expect(regionsFor('Saudi Arabia')).toEqual([]);
  });
  it('refuses a move out of an in-country region without a lawful route', () => {
    expect(canMoveRegion('ME-AE', 'IN').ok).toBe(false);
    expect(canMoveRegion('ME-AE', 'IN', 'SCC-2026-01').ok).toBe(true);
    expect(canMoveRegion('IN', 'US').ok).toBe(false);
    expect(canMoveRegion('IN', 'ME-AE').ok).toBe(true);
  });
});

const JOBS: JobError[] = [
  { id: 'a', kind: 'Import', source: 'Employee import', record: 'Row 4', error: 'PAN missing', attempts: 1, nextRetry: null, owner: null, ageHours: 2, area: 'people' },
  { id: 'b', kind: 'Integration delivery', source: 'Bank file', record: 'SAL-SEP', error: 'Rejected', attempts: 1, nextRetry: null, owner: 'Suresh Pillai', ageHours: 30, area: 'payroll' },
];

describe('Jobs & errors (PLT-38)', () => {
  it('filters by persona', () => {
    expect(jobsForPersona(JOBS, 'SA')).toHaveLength(2);
    expect(jobsForPersona(JOBS, 'HR').map((j) => j.id)).toEqual(['a']);
    expect(jobsForPersona(JOBS, 'PA').map((j) => j.id)).toEqual(['b']);
  });
  it('shows escalation for failures without an owner and requires a skip reason', async () => {
    const u = userEvent.setup();
    render(<JobsErrorsScreen jobs={JOBS} />);
    expect(screen.getByText(/1 failures have no owner/)).toBeInTheDocument();
    await u.click(screen.getAllByRole('button', { name: 'Skip' })[0]);
    const dlg = await screen.findByRole('dialog');
    await u.click(within(dlg).getByRole('button', { name: 'Skip with reason' }));
    expect(within(dlg).getByText(/Enter why you are skipping/)).toBeInTheDocument();
  });
});

describe('feature requests (PLT-51)', () => {
  it('lets a person vote once', async () => {
    const u = userEvent.setup();
    render(<FeatureRequestsScreen isAdmin betas={[]} requests={[{ id: 'f', title: 'Tamil payslips', product: 'Payroll', status: 'Planned', votes: 4, voted: false, raisedBy: 'Suresh Pillai' }]} />);
    await u.click(screen.getByRole('button', { name: 'Vote for Tamil payslips' }));
    expect(screen.getByRole('button', { name: 'You voted for Tamil payslips' })).toBeDisabled();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

describe('agent plan card (PLT-63 / 64)', () => {
  it('marks always-confirm steps and blocks approval when outside permissions', () => {
    render(
      <AgentPlanCard
        request="Release payroll"
        phase="plan"
        actingAs="as you"
        blocked="No payroll release rights."
        steps={[{ id: 'x', action: 'Release October payroll', records: '248 payslips', api: 'Payroll', alwaysConfirm: 'money', irreversible: true }]}
      />,
    );
    expect(screen.getByText(/Always confirm: Money/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve plan' })).toBeDisabled();
  });
  it('offers undo only for reversible done steps', () => {
    render(<AgentPlanCard request="Move" phase="summary" actingAs="as you" steps={TRANSFER_PLAN.map((s) => ({ ...s, state: 'done' as const }))} />);
    expect(screen.getByRole('button', { name: 'Undo 2 steps' })).toBeEnabled();
  });
});
