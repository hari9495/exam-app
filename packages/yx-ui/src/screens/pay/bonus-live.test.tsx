import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BonusComputationScreen } from './offcycle';
import type { BonusComputation, BonusOverview, LiveBonus } from './bonus-live';

// The designed PAY-24 screen with the live page's data: every state, the pressed-too-early errors, server refusals and
// the toasts after each step.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const YEAR = { start: '2025-04-01', end: '2026-03-31', label: '2025-26', dueOn: '2026-11-30' };
const RULES = { yearStartMonth: 4, eligibilityWage: '21000', calculationCeiling: '7000', minRate: '8.33', maxRate: '20', minWorkingDays: 30, minAmount: '100', allocablePercent: '60', carryYears: 4, dueMonths: 8 };
const ROW = { employmentId: 'em1', employeeId: 'e1', employeeCode: 'KF-0101', name: 'Lakshmi Devi', wageTotal: '72000.00', workingDays: '296', minimumWage: '0.00', ceiling: '7000.00', eligibleMonths: 12, eligible: true, reason: null, bonusSalary: '72000.00', bonus: '5998.00', pujaPaid: '0.00', misconductLoss: '0.00', disqualified: false, adjustReason: null, deductions: '0.00', payable: '5998.00' };
const OUT = { ...ROW, employmentId: 'em2', employeeId: 'e2', employeeCode: 'KF-0102', name: 'Ravi Kumar', eligible: false, reason: 'Worked 29 days; at least 30 are needed.', bonus: '0.00', payable: '0.00' };
const COMP: BonusComputation = {
  id: 'c1',
  year: YEAR,
  status: 'draft',
  version: 2,
  overdue: false,
  rules: RULES,
  availableSurplus: null,
  allocableSurplus: null,
  openingSetOn: '0.00',
  openingSetOff: '0.00',
  firstYear: true,
  setOnIn: '0.00',
  setOffIn: '0.00',
  setOnUsed: '0.00',
  setOffSettled: '0.00',
  setOnMade: '0.00',
  setOffMade: '0.00',
  supportedRate: '8.33',
  chosenRate: null,
  rate: '8.33',
  totals: { people: 2, eligible: 1, salary: '72000.00', bonus: '5998.00', deductions: '0.00', payable: '5998.00' },
  createdBy: { id: 'u-me', name: 'Priya Nair' },
  submitted: null,
  approved: null,
  sent: null,
  returnedReason: null,
  madeByMe: true,
  rows: [ROW, OUT],
};
const overview = (c: Partial<BonusComputation> | null, can = { manage: true, approve: false }): BonusOverview => ({
  years: [{ ...YEAR, ended: true }, { start: '2026-04-01', end: '2027-03-31', label: '2026-27', dueOn: '2027-11-30', ended: false }],
  year: { ...YEAR, ended: true },
  rules: RULES,
  can,
  computation: c ? { ...COMP, ...c } : null,
});
const live = (o: Partial<LiveBonus> = {}): LiveBonus => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'kfpl', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }],
  entityId: 'kfpl',
  onEntity: vi.fn(),
  onYear: vi.fn(),
  data: overview({}),
  onCompute: vi.fn(async () => ({})),
  onChange: vi.fn(async () => ({})),
  onRow: vi.fn(async () => ({})),
  onSubmit: vi.fn(async () => ({})),
  onApprove: vi.fn(async () => ({})),
  onReturn: vi.fn(async () => ({})),
  onSend: vi.fn(async () => ({})),
  onFormC: vi.fn(async () => ({})),
  runHref: (id) => `/yx/payroll/runs/${id}`,
  ...o,
});

describe('Statutory bonus (PAY-24 live)', () => {
  it('nothing worked out yet: payroll works it out for the ended year, with a toast', async () => {
    const l = live({ data: overview(null) });
    render(<BonusComputationScreen live={l} />);
    expect(screen.getByText('No bonus worked out for 2025-26')).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Work out bonus' }));
    expect(l.onCompute).toHaveBeenCalledWith('2025-04-01');
    expect((await screen.findAllByText('Bonus for 2025-26 worked out. Enter the surplus next.'))[0]).toBeTruthy();
  });

  it('a year that has not ended says so; a server refusal is shown as it came', async () => {
    const l = live({ data: { ...overview(null), year: { start: '2026-04-01', end: '2027-03-31', label: '2026-27', dueOn: '2027-11-30', ended: false } }, onCompute: vi.fn(async () => Promise.reject(new Error('The 2026-27 accounting year ends on 2027-03-31. Work out its bonus after that day.'))) });
    render(<BonusComputationScreen live={l} />);
    expect(screen.getByText(/This accounting year ends on 31 Mar 2027/)).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Work out bonus' }));
    expect(await screen.findByText('The 2026-27 accounting year ends on 2027-03-31. Work out its bonus after that day.')).toBeTruthy();
  });

  it('an approver without the payroll key sees no "Work out bonus" button', () => {
    render(<BonusComputationScreen live={live({ data: overview(null, { manage: false, approve: true }) })} />);
    expect(screen.queryByRole('button', { name: 'Work out bonus' })).toBeNull();
  });

  it('the year is a pick-one Segment; choosing one asks for it', async () => {
    const l = live();
    render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('radio', { name: '2026-27' }));
    expect(l.onYear).toHaveBeenCalledWith('2026-04-01');
  });

  it('send for approval pressed too early: the surplus field error, focus, nothing sent', async () => {
    const l = live({ story: { step: 'approve' } });
    render(<BonusComputationScreen live={l} />);
    const send = screen.getByRole('button', { name: 'Send for approval' }) as HTMLButtonElement;
    // The button is never disabled.
    expect(send.disabled).toBe(false);
    await ue.click(send);
    // It opens the surplus step with the field error and the focus on the field.
    expect(await screen.findByText('Enter the available surplus from the accounts (it may be 0).')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe('bn-surplus'));
    expect(l.onSubmit).not.toHaveBeenCalled();
  });

  it('saves the surplus and the opening set-on (first year), with a toast', async () => {
    const l = live({ story: { step: 'surplus' } });
    render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Save surplus' }));
    expect(await screen.findByText('Enter the available surplus from the accounts (it may be 0).')).toBeTruthy();
    expect(l.onChange).not.toHaveBeenCalled();
    await ue.type(screen.getByLabelText(/Available surplus 2025-26/), '200000');
    await ue.type(screen.getByLabelText(/Set-on brought in/), '5000');
    await ue.click(screen.getByRole('button', { name: 'Save surplus' }));
    expect(l.onChange).toHaveBeenCalledWith({ availableSurplus: '200000.00', openingSetOn: '5000.00', openingSetOff: '0.00' });
    expect((await screen.findAllByText('Surplus saved. The rate and the bonus are worked out again.'))[0]).toBeTruthy();
  });

  it('shows each person, why someone is left out, and sends a saved bonus for approval', async () => {
    const l = live({ data: overview({ availableSurplus: '200000.00', allocableSurplus: '120000.00' }) });
    render(<BonusComputationScreen live={l} />);
    expect(screen.getByText('No: Worked 29 days; at least 30 are needed.')).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(l.onSubmit).toHaveBeenCalled();
    expect((await screen.findAllByText('Bonus for 2025-26 sent for approval.'))[0]).toBeTruthy();
  });

  it('a rate below what the surplus supports comes back as the server refusal', async () => {
    const l = live({ onChange: vi.fn(async () => Promise.reject(new Error('The surplus supports 12.5%, so the bonus rate must be between 12.5% and 20%.'))) });
    render(<BonusComputationScreen live={l} />);
    const field = screen.getByLabelText(/Bonus rate/);
    await ue.clear(field);
    await ue.click(screen.getByRole('button', { name: 'Work out at this rate' }));
    expect(await screen.findByText(/Enter a bonus rate between 8.33% and 20%/)).toBeTruthy();
    await ue.type(field, '10');
    await ue.click(screen.getByRole('button', { name: 'Work out at this rate' }));
    expect(l.onChange).toHaveBeenCalledWith({ rate: '10.00' });
    expect(await screen.findByText('The surplus supports 12.5%, so the bonus rate must be between 12.5% and 20%.')).toBeTruthy();
  });

  it('deductions: a reason is needed; the dismissal is a Segment; saved with a toast', async () => {
    const l = live();
    render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Deductions for Lakshmi Devi' }));
    const drawer = await screen.findByRole('dialog', { name: 'Lakshmi Devi · deductions' });
    await ue.type(within(drawer).getByLabelText(/Puja or customary bonus/), '1000');
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await within(drawer).findByText('Give the reason (at least 5 characters).')).toBeTruthy();
    expect(l.onRow).not.toHaveBeenCalled();
    await ue.click(within(drawer).getByRole('radio', { name: 'Yes' }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Diwali puja bonus');
    await ue.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(l.onRow).toHaveBeenCalledWith('em1', { pujaPaid: '1000.00', misconductLoss: '0.00', disqualified: true, reason: 'Diwali puja bonus' });
    expect((await screen.findAllByText('Deductions saved for Lakshmi Devi.'))[0]).toBeTruthy();
  });

  it('waiting for approval: the approver approves or sends back with a reason', async () => {
    const l = live({ data: overview({ status: 'submitted', availableSurplus: '0.00', madeByMe: false, submitted: { by: 'Priya Nair', at: '2026-10-20T10:00:00Z' } }, { manage: false, approve: true }), story: { step: 'approve' } });
    render(<BonusComputationScreen live={l} />);
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Deductions for/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    const drawer = await screen.findByRole('dialog', { name: 'Send the bonus back' });
    await ue.click(within(drawer).getByRole('button', { name: 'Send back' }));
    expect(l.onReturn).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox'), 'Check the puja amounts');
    await ue.click(within(drawer).getByRole('button', { name: 'Send back' }));
    expect(l.onReturn).toHaveBeenCalledWith('Check the puja amounts');
    await ue.click(screen.getByRole('button', { name: 'Approve bonus' }));
    expect(l.onApprove).toHaveBeenCalled();
    expect((await screen.findAllByText('Bonus for 2025-26 approved.'))[0]).toBeTruthy();
  });

  it('the maker cannot approve their own: said plainly, nothing sent', async () => {
    const l = live({ data: overview({ status: 'submitted', availableSurplus: '0.00', madeByMe: true }, { manage: true, approve: true }), story: { step: 'approve' } });
    render(<BonusComputationScreen live={l} />);
    expect(screen.queryByRole('button', { name: 'Send back' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Approve bonus' }));
    expect(await screen.findByText('You worked on this bonus, so someone else approves it.')).toBeTruthy();
    expect(l.onApprove).not.toHaveBeenCalled();
  });

  it('approved: payroll confirms sending it to an off-cycle run; sent shows the run link', async () => {
    const l = live({ data: overview({ status: 'approved', availableSurplus: '0.00', madeByMe: false }), story: { step: 'approve' } });
    const { unmount } = render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Send to off-cycle run' }));
    const dialog = await screen.findByRole('dialog', { name: /Send ₹5,998 bonus to an off-cycle run\?/ });
    expect(within(dialog).getByText(/1 people get one-time bonus pay/)).toBeTruthy();
    await ue.click(within(dialog).getByRole('button', { name: 'Send to off-cycle run' }));
    await waitFor(() => expect(l.onSend).toHaveBeenCalled());
    expect((await screen.findAllByText('Bonus for 2025-26 sent to an off-cycle run.'))[0]).toBeTruthy();
    unmount();
    render(<BonusComputationScreen live={live({ data: overview({ status: 'sent', availableSurplus: '0.00', sent: { by: 'Priya Nair', at: '2026-10-23T09:00:00Z', runId: 'r9', runStatus: 'draft', runMonth: '2026-10' } }), story: { step: 'approve' } })} />);
    expect(screen.getByRole('link', { name: 'Bonus run · 2026-10' }).getAttribute('href')).toBe('/yx/payroll/runs/r9');
  });

  it('Form C (bonus register): only once approved; PDF or spreadsheet, each with a toast; a refusal is shown as it came', async () => {
    const { unmount } = render(<BonusComputationScreen live={live({ data: overview({ status: 'submitted', availableSurplus: '0.00' }, { manage: true, approve: true }), story: { step: 'approve' } })} />);
    expect(screen.queryByRole('button', { name: 'Download Form C' })).toBeNull();
    unmount();
    const l = live({ data: overview({ status: 'approved', availableSurplus: '0.00', madeByMe: false }, { manage: false, approve: true }), story: { step: 'approve' } });
    const r2 = render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Download Form C' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'PDF (to sign and keep)' }));
    await waitFor(() => expect(l.onFormC).toHaveBeenCalledWith('pdf'));
    expect((await screen.findAllByText('Form C for 2025-26 downloaded as a PDF.'))[0]).toBeTruthy();
    await ue.click(screen.getByRole('button', { name: 'Download Form C' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Spreadsheet (CSV)' }));
    await waitFor(() => expect(l.onFormC).toHaveBeenCalledWith('csv'));
    expect((await screen.findAllByText('Form C for 2025-26 downloaded as a spreadsheet.'))[0]).toBeTruthy();
    r2.unmount();
    const refused = live({ data: overview({ status: 'sent', availableSurplus: '0.00' }), story: { step: 'approve' }, onFormC: vi.fn(async () => Promise.reject(new Error('Form C is made once the bonus is approved.'))) });
    render(<BonusComputationScreen live={refused} />);
    await ue.click(screen.getByRole('button', { name: 'Download Form C' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'PDF (to sign and keep)' }));
    expect(await screen.findByText('Form C is made once the bonus is approved.')).toBeTruthy();
  });

  it('the eligibility rule note follows the company setting (last day when the computation has none)', () => {
    const { unmount } = render(<BonusComputationScreen live={live()} />);
    expect(screen.getByTestId('bn-rate-rule').textContent).toBe("Eligibility rule: the salary rate on the month's last day. HR sets it in Settings › Payroll rules.");
    unmount();
    render(<BonusComputationScreen live={live({ data: overview({ rules: { ...RULES, eligibilityRateOn: 'highest_in_month' } }) })} />);
    expect(screen.getByTestId('bn-rate-rule').textContent).toContain('the highest salary rate in force during the month');
  });

  it('the eligibility note says the limit is on the full-month salary rate', () => {
    render(<BonusComputationScreen live={live()} />);
    expect(screen.getByText(/a full-month salary rate \(not what a part month earned\) up to ₹21,000/)).toBeTruthy();
  });

  it('loading, error with retry, and no legal entity chosen', async () => {
    const { unmount } = render(<BonusComputationScreen live={live({ state: 'loading' })} />);
    expect(screen.getByRole('status', { name: 'Loading the statutory bonus' })).toBeTruthy();
    unmount();
    const l = live({ state: 'error' });
    const r2 = render(<BonusComputationScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(l.onRetry).toHaveBeenCalled();
    r2.unmount();
    render(<BonusComputationScreen live={live({ entityId: null, data: null })} />);
    expect(screen.getByText('No legal entity chosen')).toBeTruthy();
  });

  it('every design story renders (sample data through the same screen)', () => {
    for (const args of [{}, { pct: 20 }, { step: 'surplus' }, { view: 'submitted' as const }, { view: 'empty' as const }, { tooEarly: true }, { view: 'submitted' as const, refused: true }, { view: 'approved' as const }, { view: 'sent' as const }]) {
      const { unmount } = render(<BonusComputationScreen {...args} />);
      expect(screen.getAllByText(/Statutory bonus/).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
