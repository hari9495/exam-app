import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ackPercent,
  addDays,
  challanShortfall,
  checkLine,
  deployBlocks,
  ecCompensation,
  expiryTone,
  formatAccessCode,
  fxFlagged,
  icIssues,
  lateFilingFee,
  mileageAmount,
  perDiemAmount,
  pfLatePayment,
  poshClock,
  poshFilingWindow,
  recoveryInstalments,
  reductionText,
  retentionLeft,
  settlement,
  showCauseDue,
  slaState,
  tdsLateInterest,
  ticketCloseInfo,
} from './ops-rules';
import { PolicyAcknowledge, RaiseTicketForm, RateTicketCard, quizScore, suggestArticles } from './helpdesk';
import { ShowCauseReply, RestrictedNotFound } from './cases';
import { ClaimComposerScreen, LineCard, claimTotals } from './expenses';
import { PreRegisterScreen, VisitorKioskScreen } from './visitors';
import { MY_VISITORS, VISITS } from './visitors-data';
import { stepIndex } from './compliance';
import { ARTICLES, POLICIES, TICKETS } from './helpdesk-data';
import { SHOW_CAUSE, IC_MEMBERS } from './cases-data';
import { MUMBAI_LINES, MY_CLAIMS } from './expenses-data';

const d = (day: number, month: number, year = 2026) => new Date(year, month, day);
const TODAY = new Date(2026, 8, 29, 9, 42);

describe('helpdesk SLA', () => {
  it('warns at 80 % and breaches at 100 %; pauses and met win', () => {
    expect(slaState(100, 240)).toBe('on-track');
    expect(slaState(192, 240)).toBe('at-risk');
    expect(slaState(240, 240)).toBe('breached');
    expect(slaState(300, 240, { paused: true })).toBe('paused');
    expect(slaState(300, 240, { met: true })).toBe('met');
  });

  it('HLP-05b: the desk\'s own at-risk point moves the warning (50 % vs 90 %), never the breach', () => {
    expect(slaState(60, 100, { atRiskPercent: 50 })).toBe('at-risk');
    expect(slaState(60, 100, { atRiskPercent: 90 })).toBe('on-track');
    expect(slaState(49, 100, { atRiskPercent: 50 })).toBe('on-track');
    expect(slaState(90, 100, { atRiskPercent: 90 })).toBe('at-risk');
    expect(slaState(100, 100, { atRiskPercent: 90 })).toBe('breached');
    expect(slaState(42, 70, { atRiskPercent: 60 })).toBe('at-risk');
  });
  it('closes 3 days after resolving and can be reopened for 7 more days', () => {
    const r = ticketCloseInfo(d(27, 8), TODAY);
    expect(r.closesOn).toEqual(d(30, 8));
    expect(r.closed).toBe(false);
    expect(ticketCloseInfo(d(10, 8), TODAY).canReopen).toBe(false);
  });
  it('suggests published articles that match the words typed', () => {
    const s = suggestArticles(ARTICLES, 'loss of pay on my payslip');
    expect(s[0].id).toBe('KB-104');
    expect(suggestArticles(ARTICLES, 'vpn home network').some((a) => a.status === 'Draft')).toBe(false);
  });
});

describe('POSH and cases', () => {
  it('computes the POSH clock: filed 1 Oct → inquiry due 30 Dec, escalates at 75 days', () => {
    const c = poshClock(d(1, 9));
    expect(c[0].due).toEqual(d(8, 9));
    expect(c[1].due).toEqual(d(30, 11));
    expect(c[1].escalateOn).toEqual(d(15, 11));
    expect(c[2].due).toBeNull();
    const done = poshClock(d(1, 9), { inquiry: d(20, 11), report: d(28, 11) });
    expect(done[2].due).toEqual(d(30, 11));
    expect(done[3].due).toEqual(addDays(d(28, 11), 60));
  });
  it('checks the 3 + 3 month filing window', () => {
    expect(poshFilingWindow(d(18, 8), TODAY)).toBe('in-time');
    expect(poshFilingWindow(d(10, 4), TODAY)).toBe('extension-needed');
    expect(poshFilingWindow(d(2, 1), TODAY)).toBe('out-of-window');
  });
  it('flags an IC with no external member', () => {
    expect(icIssues(IC_MEMBERS, TODAY)).toEqual([]);
    expect(icIssues(IC_MEMBERS.filter((m) => m.role !== 'external'), TODAY)).toContain('Add one external member');
  });
  it('gives 7 days to reply to a show-cause notice, extendable', () => {
    expect(showCauseDue(d(23, 8))).toEqual(d(30, 8));
    expect(showCauseDue(d(23, 8), 7)).toEqual(d(7, 9));
  });
  it('makes a 16-character access code in groups of four', () => {
    expect(formatAccessCode(42)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(formatAccessCode(42)).toBe(formatAccessCode(42));
  });
  it('computes EC compensation from IN.EC parameters with the wage ceiling', () => {
    const total = ecCompensation({ kind: 'permanent-total', monthlyWage: 42000, factor: 197.06 });
    expect(total.wageUsed).toBe(15000);
    expect(total.amount).toBe(Math.round(0.6 * 15000 * 197.06));
    expect(ecCompensation({ kind: 'permanent-partial', monthlyWage: 42000, factor: 197.06, disablementPct: 20 }).amount).toBe(Math.round(total.amount * 0.2));
    expect(ecCompensation({ kind: 'death', monthlyWage: 5000, factor: 40 }).amount).toBe(120000);
  });
});

describe('expenses', () => {
  it('computes mileage and per diem, never typed', () => {
    expect(mileageAmount(42, 17)).toBe(714);
    expect(perDiemAmount(2, 1200)).toBe(2400);
  });
  it('flags over-limit, missing receipt, duplicates and hard blocks', () => {
    expect(checkLine({ amount: 9200, hasReceipt: true }, { perLine: 7500, receiptAbove: 500 })).toEqual([{ kind: 'over-limit', excess: 1700, blocked: false }]);
    expect(checkLine({ amount: 100000, hasReceipt: false }, { perLine: 1500, receiptAbove: 500, hardBlock: true }).map((f) => f.kind)).toEqual(['over-limit', 'receipt-missing']);
    expect(checkLine({ amount: 640, hasReceipt: true, duplicateOf: 'EXP-1036' }, { receiptAbove: 500 })[0].kind).toBe('duplicate');
  });
  it('leads with net payable and shows what to return', () => {
    expect(settlement(7000, 10000)).toEqual({ netPayable: 0, toReturn: 3000 });
    expect(settlement(19794, 10000)).toEqual({ netPayable: 9794, toReturn: 0 });
    expect(claimTotals(MY_CLAIMS[2])).toMatchObject({ claimed: 2000, approved: 1200, netPayable: 1200 });
  });
  it('words a reduction with its reason', () => {
    expect(reductionText(1200, 2000, 'hotel cap Tier 2')).toBe('Approved ₹1,200 of ₹2,000 — hotel cap Tier 2');
  });
  it('flags FX rates more than 3 % from the reference', () => {
    expect(fxFlagged(23.88, 22.96)).toBe(true);
    expect(fxFlagged(23.3, 22.96)).toBe(false);
  });
  it('splits recovery into 3 instalments with the remainder last', () => {
    expect(recoveryInstalments(6600)).toEqual([2200, 2200, 2200]);
    expect(recoveryInstalments(1000)).toEqual([333, 333, 334]);
  });
  it('asks for a reason on an over-limit line', () => {
    render(<LineCard line={MUMBAI_LINES[1]} index={1} />);
    expect(screen.getByText(/Over the limit by ₹1,700/)).toBeInTheDocument();
  });
});

describe('statutory', () => {
  it('computes s.201(1A) interest only after the due date, per month or part', () => {
    expect(tdsLateInterest(482340, d(30, 8), d(7, 9), d(6, 9))).toBe(0);
    expect(tdsLateInterest(100000, d(30, 8), d(7, 9), d(12, 10))).toBe(3000);
  });
  it('caps the s.234E fee at the TDS amount', () => {
    expect(lateFilingFee(10, 50000)).toBe(2000);
    expect(lateFilingFee(400, 50000)).toBe(50000);
  });
  it('bands PF 14B damages by delay', () => {
    expect(pfLatePayment(2640, 44).band).toMatch(/Up to 2 months/);
    expect(pfLatePayment(10000, 100).band).toMatch(/2 to 4 months/);
  });
  it('maps filing steps to the trail for self and partner modes', () => {
    expect(stepIndex('filed', 'self')).toBe(5);
    expect(stepIndex('generated', 'partner')).toBe(1);
  });
});

describe('contract labour and visitors', () => {
  const base = { dob: d(3, 6, 1994), on: TODAY, licenceValidTo: d(31, 11), licenceMax: 30, activeDeployments: 20, licenceStates: ['Tamil Nadu', 'Karnataka'], siteState: 'Tamil Nadu' };
  it('blocks the 31st worker, an under-18 worker and a site outside the licence scope', () => {
    expect(deployBlocks(base)).toEqual([]);
    expect(deployBlocks({ ...base, activeDeployments: 30 })[0]).toMatch(/allows 30/);
    expect(deployBlocks({ ...base, dob: d(12, 4, 2009) })[0]).toMatch(/under 18/);
    expect(deployBlocks({ ...base, siteState: 'Kerala' })[0]).toMatch(/does not cover Kerala/);
    expect(deployBlocks({ ...base, licenceValidTo: d(15, 8) })[0]).toMatch(/not valid/);
  });
  it('flags a short challan and expiry lead times', () => {
    expect(challanShortfall(40, 52)).toBe(12);
    expect(expiryTone(d(20, 9), TODAY).tone).toBe('danger');
    expect(expiryTone(d(20, 10), TODAY).tone).toBe('warning');
    expect(expiryTone(d(15, 8), TODAY).text).toMatch(/Expired/);
  });
  it('counts down visitor data retention (90 days)', () => {
    expect(retentionLeft(d(5, 6), TODAY)).toBe(4);
    expect(retentionLeft(d(1, 0), TODAY)).toBe(0);
  });
  it('computes acknowledgement %', () => {
    expect(ackPercent(171, 248)).toBe(69);
    expect(ackPercent(0, 0)).toBe(0);
  });
});

describe('flows', () => {
  it('shows article suggestions while the subject is typed', async () => {
    const u = userEvent.setup();
    render(<RaiseTicketForm articles={ARTICLES} />);
    await u.type(screen.getByRole('textbox', { name: /Subject/ }), 'payslip loss of pay');
    expect(screen.getByText('Why does my payslip show loss of pay?')).toBeInTheDocument();
  });
  it('Acknowledge is never greyed out: pressed before ticking it says what is missing; ticked, it records and toasts', async () => {
    const u = userEvent.setup();
    render(<PolicyAcknowledge policy={POLICIES[3]} today={TODAY} />);
    const btn = screen.getByRole('button', { name: 'Acknowledge' });
    expect(btn).toBeEnabled();
    await u.click(btn);
    expect(screen.getByText('Tick that you have read and understood the policy.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    expect(screen.queryByText('Acknowledged')).toBeNull();
    await u.click(screen.getByRole('checkbox'));
    await u.click(btn);
    expect(screen.getByText('Acknowledged')).toBeInTheDocument();
    expect(screen.getAllByText(`${POLICIES[3].title} acknowledged`).length).toBeGreaterThan(0);
  });
  it('requires every quiz answer right', () => {
    expect(quizScore({}).passed).toBe(false);
    expect(quizScore({ q1: '3 months, extendable by 3 more', q2: 'Only the Internal Committee members on the case' }).passed).toBe(true);
  });
  it('moves the show-cause due date when an extension is asked', async () => {
    const u = userEvent.setup();
    render(<ShowCauseReply notice={SHOW_CAUSE} today={TODAY} />);
    expect(screen.getByText('Due 30 Sep 2026')).toBeInTheDocument();
    await u.click(screen.getByRole('checkbox', { name: /7 more days/ }));
    expect(screen.getByText('Due 7 Oct 2026')).toBeInTheDocument();
  });
  it('shows a non-member Not found, with no Request access', () => {
    render(<RestrictedNotFound />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.queryByText(/access/i)).toBeNull();
  });
});

// Founder rules 28 Oct 2026: no greyed-out button (pressed too early it says why); done is a toast.
describe('house rules (Ops)', () => {
  it('rating: Send rating pressed with no choice shows the field error and sends nothing; with a choice it toasts', async () => {
    const u = userEvent.setup();
    render(<RateTicketCard ticket={TICKETS[0]!} today={TODAY} resolvedOn={TODAY} />);
    await u.click(screen.getByRole('button', { name: 'Send rating' }));
    expect(screen.getByText('Choose a rating from 1 to 5.')).toBeInTheDocument();
    expect(screen.queryByText('Thanks. Your rating is saved.')).toBeNull();
    await u.click(screen.getByLabelText('5 Very good'));
    await u.click(screen.getByRole('button', { name: 'Send rating' }));
    expect(screen.getAllByText('Thanks. Your rating is saved.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull();
  });

  it('claim: Submit with no lines says why and stays a draft', async () => {
    const u = userEvent.setup();
    render(<ClaimComposerScreen title="Empty claim" lines={[]} advance={0} />);
    await u.click(screen.getByRole('button', { name: 'Submit claim' }));
    expect(screen.getAllByText('Add a line first: a receipt, mileage or per diem.').length).toBeGreaterThan(0);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('visitor invite: Send invite closes the form and toasts; nothing shows before', async () => {
    const u = userEvent.setup();
    render(<PreRegisterScreen visits={MY_VISITORS} today={TODAY} formOpen />);
    expect(screen.queryByText('Invite sent')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Send invite' }));
    expect((await screen.findAllByText('Invite sent')).length).toBeGreaterThan(0);
  });

  it('kiosk notice: Accept and continue before ticking shows the error on the checkbox', async () => {
    const u = userEvent.setup();
    render(<VisitorKioskScreen step="notice" visit={VISITS[0]!} today={TODAY} />);
    await u.click(screen.getByRole('button', { name: 'Accept and continue' }));
    expect(screen.getByText('Tick to accept the notice before you continue.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'I have read and accept the visitor notice' })).toHaveFocus();
    // Slice 2 (606): the NDA and the induction say so too.
    expect(screen.getByText('Tick to accept the visitor NDA.')).toBeInTheDocument();
  });
});
