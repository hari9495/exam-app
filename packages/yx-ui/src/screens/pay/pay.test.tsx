import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EWA_STARTER,
  applyDeductionCap,
  arrearsTotal,
  checkSplit,
  codeWageAddBack,
  commission,
  compareRegimes,
  computeTax,
  emiAmount,
  emiSchedule,
  esiContribution,
  ewaAvailable,
  gratuity,
  hraExemptionMonth,
  minimumWageCheck,
  monthlyTds,
  noPanTds,
  onCallPay,
  pfContribution,
  pieceRatePay,
  prorate,
  retrenchmentCompensation,
  settleNet,
  slabTax,
  SLABS,
  splitPool,
  statutoryBonus,
  variance,
  NO_DEDUCTIONS,
} from './pay-logic';
import { IrreversibleSheet, StateBlock, WhyThisNumber } from './pay-kit';
import { entityHeadcount } from '../_kit/data';
import { RegimeComparePanel, EwaRequestScreen, PayslipViewerScreen } from './employee-pay';
import { RunReadinessScreen } from './payroll-run';
import { ArrearsBaseScreen } from './offcycle';
import { HOLDS, ME, MY_LINES, MY_NET, MY_GROSS, MY_DEDUCTIONS, MY_TAX, MY_TDS_BY_MONTH, RUN, RUN_ROWS } from './pay-data';

describe('tax (IN.TDS tax year 2026-27)', () => {
  it('4–8 L slab at 5% gives ₹20,000 on ₹8 L', () => {
    expect(slabTax(800_000, SLABS.new)).toBe(20_000);
  });
  it('new regime: rebate makes tax nil up to ₹12 L taxable', () => {
    expect(computeTax(1_275_000, 'new').total).toBe(0);
  });
  it('new regime: marginal relief just above ₹12 L', () => {
    const r = computeTax(1_285_000, 'new'); // taxable 12,10,000
    expect(r.slabTax - r.rebate).toBe(10_000);
  });
  it('matches the sample employee projection (₹1,39,980 on ₹17,47,980)', () => {
    // 11 × ₹1,39,915 + May ₹2,13,579 − one unpaid day ₹4,664.
    expect(11 * MY_GROSS + 2_13_579 - 4_664).toBe(MY_TAX.projectedGross);
    expect(computeTax(17_47_980, 'new').total).toBe(1_39_980);
  });
  it('old regime counts capped deductions; new regime ignores them', () => {
    const d = { ...NO_DEDUCTIONS, sec80c: 2_00_000, nps: 50_000 };
    expect(computeTax(15_00_000, 'old', d).deductions).toBe(2_00_000);
    expect(computeTax(15_00_000, 'new', d).deductions).toBe(0);
  });
  it('non-residents get no rebate', () => {
    expect(computeTax(10_00_000, 'new', NO_DEDUCTIONS, false).total).toBeGreaterThan(0);
  });
  it('compareRegimes reports the lower one without choosing', () => {
    const c = compareRegimes(17_47_980, NO_DEDUCTIONS);
    expect(c.lower).toBe('new');
    expect(c.difference).toBe(c.old.total - c.new.total);
  });
  it('monthly TDS spreads the remaining tax', () => {
    expect(monthlyTds(1_39_980, 69_244, 7)).toBe(10_105);
    expect(monthlyTds(10_000, 20_000, 3)).toBe(0);
  });
  it('no PAN: higher of 20% or slab rate', () => {
    expect(noPanTds(10_000, 5)).toBe(2_000);
    expect(noPanTds(10_000, 30)).toBe(3_000);
  });
  it('HRA exemption is the least of three limbs', () => {
    expect(hraExemptionMonth(30_000, 32_000, 60_000, true)).toBe(26_000);
    expect(hraExemptionMonth(30_000, 4_000, 60_000, true)).toBe(0);
  });
});

describe('statutory', () => {
  it('PF: basic ₹20,000 gives EPS ₹1,250 and employer EPF ₹1,150', () => {
    const pf = pfContribution(20_000);
    expect(pf.eps).toBe(1_250);
    expect(pf.epf).toBe(1_150);
  });
  it('ESI at ₹15,050 is ₹113 (rounded up); none above ceiling unless PwD', () => {
    expect(esiContribution(15_050).employee).toBe(113);
    expect(esiContribution(23_000).covered).toBe(false);
    expect(esiContribution(23_000, true).covered).toBe(true);
  });
  it('Code wage add-back: basic ₹20,000 of ₹60,000 adds back ₹10,000', () => {
    expect(codeWageAddBack(20_000, 60_000)).toEqual({ addBack: 10_000, codeWage: 30_000 });
  });
  it('minimum wage uses the higher of state and floor wage', () => {
    const r = minimumWageCheck(11_000, 10_500, 11_500);
    expect(r.below).toBe(true);
    expect(r.basis).toBe('floor');
  });
});

describe('run maths', () => {
  it('prorates once by payable days', () => {
    expect(prorate(30_000, 29, 30)).toBe(29_000);
    expect(prorate(30_000, 40, 30)).toBe(30_000);
  });
  it('flags variance above threshold or on component change', () => {
    expect(variance(110_000, 100_000).flagged).toBe(false);
    expect(variance(115_000, 100_000).flagged).toBe(true);
    expect(variance(100_000, 100_000, 10, true).flagged).toBe(true);
  });
  it('deduction cap: court order deducted, loan EMI deferred', () => {
    const r = applyDeductionCap(
      40_000,
      [
        { id: 'l', label: 'Loan', kind: 'loan', amount: 10_000 },
        { id: 's', label: 'Statutory', kind: 'statutory', amount: 5_000 },
        { id: 'c', label: 'Court', kind: 'court', amount: 12_000 },
      ],
      50,
    );
    expect(r.cap).toBe(20_000);
    expect(r.lines.map((l) => l.id)).toEqual(['s', 'c', 'l']);
    expect(r.lines.find((l) => l.id === 'c')!.deducted).toBe(12_000);
    expect(r.lines.find((l) => l.id === 'l')!.deducted).toBe(3_000);
    expect(r.lines.find((l) => l.id === 'l')!.deferred).toBe(7_000);
  });
  it('negative net becomes zero with a carry-forward', () => {
    expect(settleNet(-4_000)).toEqual({ paid: 0, carryForward: 4_000 });
  });
});

describe('earned wage access', () => {
  const base = { expectedNet: 30_000, periodDays: 30, daysEarned: 12, drawnThisPeriod: 0, drawsThisPeriod: 0, dueDeductions: 0, daysToCutOff: 10, confirmed: true };
  it('Rohan sees ₹6,000 available (50% of ₹12,000 earned)', () => {
    expect(ewaAvailable(EWA_STARTER, base)).toMatchObject({ available: 6_000, earnedToDate: 12_000, reason: null });
  });
  it('refuses inside the blackout, on hold, on notice and when draws are used', () => {
    expect(ewaAvailable(EWA_STARTER, { ...base, daysToCutOff: 3 }).reason).toMatch(/before payroll cut-off/);
    expect(ewaAvailable(EWA_STARTER, { ...base, onHold: true }).reason).toMatch(/on hold/);
    expect(ewaAvailable(EWA_STARTER, { ...base, onNotice: true }).reason).toMatch(/notice/);
    expect(ewaAvailable(EWA_STARTER, { ...base, drawsThisPeriod: 3 }).reason).toMatch(/all 3 draws/);
  });
});

describe('loans, gratuity, bonus, special pay', () => {
  it('interest-free EMI rounds up; schedule clears the balance', () => {
    expect(emiAmount(30_000, 0, 3)).toBe(10_000);
    const s = emiSchedule(1_00_000, 6, 12, 8, 2026);
    expect(s[s.length - 1].balance).toBe(0);
    expect(s[0].month).toBe('Sep 2026');
    // 12 EMIs means 12 rows: the last instalment clears the rounding left over.
    expect(emiSchedule(3_50_000, 6, 12, 0, 2026)).toHaveLength(12);
  });
  it('a paused month accrues interest on the balance', () => {
    const s = emiSchedule(1_00_000, 6, 12, 0, 2026, 0, [1]);
    expect(s[1].status).toBe('paused');
    expect(s[1].interest).toBeGreaterThan(0);
    expect(s[1].balance).toBe(s[0].balance + s[1].interest);
    expect(s[s.length - 1].balance).toBe(0);
  });
  it('old regime caps employer NPS at 10% of basic and deducts professional tax', () => {
    const d = { ...NO_DEDUCTIONS, employerNps: 92_400, basic: 7_20_000, professionalTax: 2_400 };
    expect(computeTax(16_00_000, 'old', d).deductions).toBe(72_000 + 2_400);
    expect(computeTax(16_00_000, 'new', d).deductions).toBe(92_400);
  });
  it('gratuity: 5 years needed; part-year of 6 months rounds up; fixed-term pro-rata after 1 year', () => {
    expect(gratuity(26_000, 59).eligible).toBe(false);
    expect(gratuity(26_000, 80)).toMatchObject({ eligible: true, years: 7, amount: 1_05_000 });
    expect(gratuity(26_000, 14, true).eligible).toBe(true);
  });
  it('statutory bonus on the ceiling and not above ₹21,000', () => {
    expect(statutoryBonus(18_000, 12, 8.33, 14_520)).toMatchObject({ eligible: true, base: 14_520 });
    expect(statutoryBonus(22_000, 12, 8.33, 14_520).eligible).toBe(false);
  });
  it('piece-rate top-up: ₹9,000 earned vs ₹11,000 minimum', () => {
    expect(pieceRatePay([{ qty: 90, rate: 100 }], 11_000)).toEqual({ earned: 9_000, topUp: 2_000, total: 11_000 });
  });
  it('tips pool ₹30,000 by 3:2:1', () => {
    expect(splitPool(30_000, [3, 2, 1])).toEqual([15_000, 10_000, 5_000]);
    expect(splitPool(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('call-out: 1 hour with 3-hour minimum pays 3 hours plus standby', () => {
    expect(onCallPay(600, 1, 3, 400, 1)).toEqual({ paidHours: 3, callOut: 1_200, total: 1_800 });
  });
  it('commission with accelerator above quota and cap', () => {
    const tiers = [
      { fromPct: 0, ratePct: 0 },
      { fromPct: 80, ratePct: 1.5 },
      { fromPct: 100, ratePct: 2.5 },
    ];
    expect(commission(1_200_000, 1_000_000, tiers)).toMatchObject({ attainment: 120, amount: 8_000 });
    expect(commission(1_200_000, 1_000_000, tiers, 5_000)).toMatchObject({ amount: 5_000, capped: true });
  });
  it('arrears need a confirmed base for every month', () => {
    const r = arrearsTotal([
      { month: 'Jul', corrected: 26_500, asPaid: 25_000, source: 'import' },
      { month: 'Aug', corrected: 26_500, asPaid: null, source: 'missing' },
    ]);
    expect(r).toEqual({ total: 1_500, missing: ['Aug'], canApprove: false });
  });
  it('retrenchment compensation: 15 days average pay × years', () => {
    expect(retrenchmentCompensation(26_000, 7)).toBe(1_05_000);
  });
  it('salary split that creates an add-back is not offered', () => {
    expect(checkSplit({ id: 'x', name: 'x', basic: 38_000, hra: 19_000, special: 56_000, reimbursements: 0, employerNps: 0 }, 14_520).ok).toBe(false);
    expect(checkSplit({ id: 'a', name: 'a', basic: 57_000, hra: 28_500, special: 27_500, reimbursements: 0, employerNps: 0 }, 14_520).ok).toBe(true);
  });
});

describe('screens', () => {
  it('irreversible sheet enables confirm only with the exact phrase', async () => {
    const u = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <IrreversibleSheet open onOpenChange={() => {}} title="Approve and lock" impact={[{ label: 'Net', value: '₹1' }]} cannotUndo="x" correction="y" phrase="KAVERI FOODS SEP 2026" maker="A" checker="B" confirmLabel="Approve and lock" onConfirm={onConfirm} />,
    );
    const btn = screen.getByRole('button', { name: 'Approve and lock' });
    expect(btn).toBeDisabled();
    const input = screen.getByLabelText(/Type KAVERI FOODS SEP 2026 to confirm/);
    await u.type(input, 'kaveri foods sep 2026');
    expect(btn).toBeDisabled();
    await u.clear(input);
    await u.type(input, 'KAVERI FOODS SEP 2026');
    expect(btn).toBeEnabled();
    await u.click(btn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('irreversible sheet refuses when maker and checker are the same person, and offers the other approver', async () => {
    const u = userEvent.setup();
    const send = vi.fn();
    render(<IrreversibleSheet open onOpenChange={() => {}} title="T" impact={[]} cannotUndo="x" correction="y" phrase="P" maker="A" checker="A" confirmLabel="Approve" onConfirm={() => {}} defaultTyped="P" otherApprover="Ramesh Krishnan" onSendToChecker={send} />);
    expect(screen.getByText('Someone else must confirm this')).toBeInTheDocument();
    // One alert per message: the maker / checker block only names the fact.
    expect(screen.getByText('Same person')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByLabelText(/Type P to confirm/)).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Send to Ramesh Krishnan for approval' }));
    expect(send).toHaveBeenCalled();
  });

  it('irreversible sheet says why the confirm button is disabled', async () => {
    const u = userEvent.setup();
    render(<IrreversibleSheet open onOpenChange={() => {}} title="T" impact={[]} cannotUndo="x" correction="y" phrase="P" maker="A" checker="A" selfApproval confirmLabel="Publish payslips" onConfirm={() => {}} />);
    expect(screen.getByText('Type P to continue')).toBeInTheDocument();
    await u.type(screen.getByLabelText(/Type P to confirm/), 'P');
    expect(screen.getByText('Add a reason (at least 5 characters)')).toBeInTheDocument();
  });

  it('why-this-number expands a line to show formula and rule', async () => {
    const u = userEvent.setup();
    render(<WhyThisNumber lines={MY_LINES} />);
    const row = screen.getByRole('button', { name: /Income tax \(TDS\)/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await u.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/IN.TDS 2025 Act/)).toBeInTheDocument();
  });

  it('payslip figures add up (net = gross − deductions)', () => {
    expect(MY_GROSS - MY_DEDUCTIONS).toBe(MY_NET);
    // TDS follows the projection: (projected tax − deducted) ÷ remaining months.
    const tds = MY_LINES.find((l) => l.id === 'tds')!.amount;
    expect(tds).toBe(monthlyTds(computeTax(MY_TAX.projectedGross, 'new').total, MY_TAX.deducted, MY_TAX.remaining));
    expect(MY_LINES.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.amount, 0)).toBe(MY_DEDUCTIONS);
  });

  it('run totals include approved one-time pay, so RUN, the register and the bank file agree', () => {
    expect(RUN.gross).toBe(RUN_ROWS.reduce((a, r) => a + r.gross, 0));
    expect(RUN_ROWS.some((r) => r.oneTime > 0)).toBe(true);
    expect(RUN_ROWS.every((r) => r.net === r.gross - r.deductions)).toBe(true);
  });

  it('the Karnataka run has every Karnataka employee, and holds match PAY-06', () => {
    expect(RUN.employees).toBe(entityHeadcount('kf-ka'));
    expect(RUN_ROWS.every((r) => r.code !== ME.code)).toBe(true);
    expect(RUN.withheld).toBe(HOLDS.filter((h) => h.status !== 'Released').length);
    expect(RUN.inBankFile + RUN.withheld + RUN.failed + RUN.cashCheque).toBe(RUN.employees);
    expect(MY_TDS_BY_MONTH.reduce((a, x) => a + x, 0)).toBe(MY_TAX.deducted);
  });

  it('StateBlock Retry shows loading, then the panel', async () => {
    const u = userEvent.setup();
    render(
      <StateBlock state="error">
        <p>Loaded panel</p>
      </StateBlock>,
    );
    await u.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Loaded panel', undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('regime compare updates live when a what-if changes', () => {
    render(<RegimeComparePanel />);
    const status = screen.getByText(/lower under the/);
    const before = status.textContent;
    const slider = screen.getByLabelText('Home-loan interest for the year');
    // range inputs: set value through the change event
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '200000');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(screen.getByText(/lower under the|same tax/).textContent).not.toBe(before);
    expect(screen.getByText('Estimate, not tax advice')).toBeInTheDocument();
  });

  it('EWA request: fee disclosure must be accepted before the draw', async () => {
    const u = userEvent.setup();
    render(<EwaRequestScreen variant="confirm" layout="desktop" />);
    const get = screen.getByRole('button', { name: /Get ₹5,000/ });
    expect(get).toBeEnabled();
    await u.click(screen.getByRole('checkbox'));
    expect(get).toBeDisabled();
  });

  it('EWA shows the reason when not available', () => {
    render(<EwaRequestScreen variant="on-hold" layout="desktop" />);
    expect(screen.getByText(/salary is on hold/)).toBeInTheDocument();
  });

  it('readiness: attendance exceptions cannot be waived; others waive with a reason', async () => {
    const u = userEvent.setup();
    render(<RunReadinessScreen />);
    const findings = screen.getByRole('region', { name: 'Validations' });
    const pText = (start: string) => (_: string, el: Element | null) => el?.tagName === 'P' && (el.textContent ?? '').startsWith(start);
    const attendance = within(findings).getByText(pText('Open attendance exceptions')).closest('li')!;
    expect(within(attendance).queryByRole('button', { name: 'Waive' })).toBeNull();
    expect(within(attendance).getByText("Can't be waived")).toBeInTheDocument();
    const pan = within(findings).getByText(pText('PAN missing or inoperative')).closest('li')!;
    await u.click(within(pan).getByRole('button', { name: 'Waive' }));
    const confirm = screen.getByRole('button', { name: 'Waive with reason' });
    expect(confirm).toBeDisabled();
    await u.type(screen.getByLabelText(/Reason/), 'PAN applied; slab TDS at 20% accepted');
    await u.click(confirm);
    expect(within(findings).getByText(/Waived by Suresh Pillai: PAN applied/)).toBeInTheDocument();
  });

  it('arrears worksheet blocks compute until the missing base is confirmed', async () => {
    const u = userEvent.setup();
    render(<ArrearsBaseScreen embedded />);
    const compute = screen.getByRole('button', { name: 'Compute arrears' });
    expect(compute).toBeDisabled();
    await u.type(screen.getByLabelText(/Basic as paid in Aug 2026/), '25000');
    await u.type(screen.getByLabelText(/Where this figure comes from/), 'Old payroll register');
    expect(compute).toBeEnabled();
  });

  it('payslip query sheet sends and confirms in the app', async () => {
    const u = userEvent.setup();
    render(<PayslipViewerScreen variant="query" />);
    await u.click(screen.getByRole('button', { name: 'Send query' }));
    expect(screen.getByText('Query sent to payroll')).toBeInTheDocument();
  });
});
