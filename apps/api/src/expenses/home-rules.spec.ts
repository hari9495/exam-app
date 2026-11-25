import { Prisma } from '@prisma/client';
import { isOverLimit, istMonth, istMonthRange, lastMonths, payMonthFor, prevMonth, teamFigures, waitingOnText } from './home-rules';

const D = (x: string) => new Prisma.Decimal(x);

describe('expenses home rules (EXP-01)', () => {
  it('buckets by the IST month: 31 Oct 19:00 UTC is already 1 Nov in India', () => {
    expect(istMonth(new Date('2026-10-31T18:29:59Z'))).toBe('2026-10');
    expect(istMonth(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11');
  });

  it('counts months back across a year end', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(lastMonths('2026-02-10', 5)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('pays in this month up to and on the cut-off day, the next month after it (and over a year end)', () => {
    expect(payMonthFor('2026-11-23', 23)).toBe('2026-11');
    expect(payMonthFor('2026-11-24', 23)).toBe('2026-12');
    expect(payMonthFor('2026-12-24', 23)).toBe('2027-01');
    expect(payMonthFor('2026-02-28', 28)).toBe('2026-02');
  });

  it('adds the approved amount once decided, else the claimed amount, exactly', () => {
    const months = ['2026-10', '2026-11'];
    const claims = [
      { id: 'a', status: 'approved', submittedAt: new Date('2026-11-02T05:00:00Z'), claimedTotal: D('1000.10'), approvedTotal: D('900.20') },
      { id: 'b', status: 'submitted', submittedAt: new Date('2026-11-03T05:00:00Z'), claimedTotal: D('0.10'), approvedTotal: null },
      { id: 'c', status: 'partly_approved', submittedAt: new Date('2026-10-05T05:00:00Z'), claimedTotal: D('500.00'), approvedTotal: D('250.00') },
      { id: 'd', status: 'rejected', submittedAt: new Date('2026-11-05T05:00:00Z'), claimedTotal: D('99.00'), approvedTotal: D('0') },
      { id: 'e', status: 'draft', submittedAt: null, claimedTotal: D('77.00'), approvedTotal: null },
      { id: 'f', status: 'approved', submittedAt: new Date('2026-06-05T05:00:00Z'), claimedTotal: D('5.00'), approvedTotal: D('5.00') },
    ];
    const lines = [
      { claimId: 'a', policyResult: { outcome: 'over_justify' } },
      { claimId: 'a', policyResult: { outcome: 'ok' } },
      { claimId: 'b', policyResult: { outcome: 'blocked' } },
      { claimId: 'c', policyResult: { outcome: 'over_justify' } },
      { claimId: 'd', policyResult: { outcome: 'over_justify' } },
      { claimId: 'b', policyResult: null },
    ];
    expect(teamFigures(months, claims, lines)).toEqual({ month: '2026-11', spend: '900.30', previous: '250.00', trend: ['250.00', '900.30'], overLimit: 2, overLimitPrevious: 1 });
  });

  it('with no claims every figure is zero', () => {
    expect(teamFigures(['2026-11'], [], [])).toEqual({ month: '2026-11', spend: '0.00', previous: null, trend: ['0.00'], overLimit: 0, overLimitPrevious: null });
  });
});

describe('team claims list (round 2)', () => {
  it('an IST month runs from 18:30 UTC the day before the 1st to the same time before the next 1st', () => {
    expect(istMonthRange('2026-11')).toEqual({ from: new Date('2026-10-31T18:30:00Z'), to: new Date('2026-11-30T18:30:00Z') });
    // The year end and a leap February.
    expect(istMonthRange('2026-12').to).toEqual(new Date('2026-12-31T18:30:00Z'));
    expect(istMonthRange('2028-02')).toEqual({ from: new Date('2028-01-31T18:30:00Z'), to: new Date('2028-02-29T18:30:00Z') });
    // A claim sent at 00:10 IST on 1 Nov belongs to November, one sent at 23:50 IST on 31 Oct to October.
    const nov = istMonthRange('2026-11');
    expect(new Date('2026-10-31T18:40:00Z') >= nov.from).toBe(true);
    expect(new Date('2026-10-31T18:20:00Z') >= nov.from).toBe(false);
  });

  it('only over-the-limit lines (needs a reason, or blocked) count', () => {
    expect(isOverLimit({ outcome: 'over_justify' })).toBe(true);
    expect(isOverLimit({ outcome: 'blocked' })).toBe(true);
    expect(isOverLimit({ outcome: 'ok' })).toBe(false);
    expect(isOverLimit({ outcome: 'not_allowed' })).toBe(false);
    expect(isOverLimit(null)).toBe(false);
    expect(isOverLimit(undefined)).toBe(false);
  });

  // Batch E A4 (answers 2551, 2552, 2556).
  it('says who a claim waits on: a person, "and N more", a shared role, the claimant, finance for payment, else no one', () => {
    const step = (approvers: { kind: string; userIds?: string[] }[], holders: string[], name = 'Manager') => ({ name, approvers, holders });
    const sent = { status: 'submitted', paymentStatus: 'not_due' };
    expect(waitingOnText(sent, step([{ kind: 'manager' }], ['Asha Rao']), null)).toBe('Asha Rao');
    expect(waitingOnText(sent, step([{ kind: 'manager' }], ['Asha Rao', 'Vikram', 'Leela']), null)).toBe('Asha Rao and 2 more');
    expect(waitingOnText(sent, step([{ kind: 'users', userIds: ['a', 'b'] }], ['A', 'B'], 'Finance check'), null)).toBe('Finance');
    expect(waitingOnText(sent, step([{ kind: 'users', userIds: ['a'] }], ['Meena'], 'Finance check'), null)).toBe('Meena');
    expect(waitingOnText(sent, step([{ kind: 'hr' }], ['X', 'Y']), null)).toBe('HR');
    expect(waitingOnText(sent, step([{ kind: 'user_group', userIds: [] }], [], 'Travel desk'), null)).toBe('Travel desk');
    expect(waitingOnText(sent, step([{ kind: 'cost_centre_owner' }], [], 'Cost-centre owner'), null)).toBe('Cost-centre owner');
    expect(waitingOnText(sent, null, null)).toBeNull();
    expect(waitingOnText({ status: 'sent_back', paymentStatus: 'not_due' }, null, null)).toBe('You');
    expect(waitingOnText({ status: 'sent_back', paymentStatus: 'not_due' }, null, 'Priya Menon')).toBe('Priya Menon');
    for (const p of ['approved_unpaid', 'payment_failed', 'in_payroll', 'payout_queued']) expect(waitingOnText({ status: 'approved', paymentStatus: p }, null, null)).toBe('Finance (payment)');
    expect(waitingOnText({ status: 'partly_approved', paymentStatus: 'approved_unpaid' }, null, null)).toBe('Finance (payment)');
    for (const c of [{ status: 'approved', paymentStatus: 'paid' }, { status: 'approved', paymentStatus: 'not_due' }, { status: 'rejected', paymentStatus: 'not_due' }, { status: 'draft', paymentStatus: 'not_due' }, { status: 'withdrawn', paymentStatus: 'not_due' }]) expect(waitingOnText(c, null, null)).toBeNull();
  });
});
