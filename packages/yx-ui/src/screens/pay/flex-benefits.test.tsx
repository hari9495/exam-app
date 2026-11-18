import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FlexSettlementScreen, MyFlexBenefitsScreen, type FlexLedgerView, type FlexOverview, type LiveFlexSettlement, type LiveMyFlexBenefits } from './flex-benefits';

// PAY-59 / PAY-60 with the live app's data (answer 2455): what the live pages must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LEDGER: FlexLedgerView = {
  taxYear: '2026-27',
  unclaimed: 'pay',
  rows: [
    { componentId: 'c1', code: 'phone', name: 'Phone and internet', monthly: '1500.00', taxableIfUnclaimed: true, months: 8, entitled: '12000.00', carriedIn: '0.00', claimed: '7200.00', pending: '900.00', available: '3900.00', settlement: null },
    { componentId: 'c2', code: 'books', name: 'Books', monthly: '1000.00', taxableIfUnclaimed: false, months: 8, entitled: '8000.00', carriedIn: '0.00', claimed: '8000.00', pending: '0.00', available: '0.00', settlement: { kind: 'exit', payMonth: '2026-11', paidTaxable: '0.00', carriedOut: '0.00', lapsed: '0.00' } },
  ],
};
const OVERVIEW: FlexOverview = {
  taxYear: '2026-27',
  opensIn: '2027-03',
  open: false,
  unclaimed: 'pay',
  people: [
    { employeeId: 'e1', name: 'Aditi Rao', employeeCode: 'KF-12', leavesOn: null, available: '9450.00', pending: '0.00', settled: null },
    { employeeId: 'e2', name: 'Arjun Mehta', employeeCode: 'KF-31', leavesOn: null, available: '3900.00', pending: '900.00', settled: null },
    { employeeId: 'e5', name: 'Meera Pillai', employeeCode: 'KF-63', leavesOn: '2026-11-14', available: '2400.00', pending: '0.00', settled: null },
    { employeeId: 'e4', name: 'Karthik Iyer', employeeCode: 'KF-58', leavesOn: '2026-09-30', available: '0.00', pending: '0.00', settled: 'exit' },
  ],
};

describe('PAY-59 My flexible benefits, live', () => {
  const mine = (over: Partial<LiveMyFlexBenefits> = {}): LiveMyFlexBenefits => ({ state: 'ready', onRetry: vi.fn(), data: LEDGER, years: ['2026-27', '2025-26'], year: '2026-27', onYear: vi.fn(), onClaim: vi.fn(), ...over });

  it('loading, could not load, no plan', async () => {
    const v = mine({ state: 'loading', data: null });
    const { rerender } = render(<MyFlexBenefitsScreen live={v} />);
    expect(screen.getByRole('status', { name: 'Loading your flexible benefits' })).toBeInTheDocument();
    rerender(<MyFlexBenefitsScreen live={{ ...v, state: 'error' }} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(v.onRetry).toHaveBeenCalled();
    rerender(<MyFlexBenefitsScreen live={{ ...v, state: 'ready', data: { ...LEDGER, rows: [] } }} />);
    expect(screen.getByText('No flexible benefits')).toBeInTheDocument();
  });

  it('the ledger: totals, what is left, what happens to it; the year is a Segment; Make a claim opens expenses', async () => {
    const v = mine();
    render(<MyFlexBenefitsScreen live={v} />);
    expect(screen.getByRole('link', { name: 'Flexible benefits' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText('₹3,900.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/What is left in March is paid as taxable salary/)).toBeInTheDocument();
    expect(screen.getByTitle('Settled at exit in November 2026: nothing left')).toBeInTheDocument();
    const years = screen.getByRole('radiogroup', { name: 'Tax year' });
    await ue.click(within(years).getByRole('radio', { name: 'FY 2025-26' }));
    expect(v.onYear).toHaveBeenCalledWith('2025-26');
    await ue.click(screen.getByRole('button', { name: 'Make a claim' }));
    expect(v.onClaim).toHaveBeenCalled();
  });
});

describe('PAY-60 Flexible benefit settlement, live', () => {
  const pay = (over: Partial<LiveFlexSettlement> = {}): LiveFlexSettlement => ({
    state: 'ready',
    onRetry: vi.fn(),
    data: OVERVIEW,
    years: ['2026-27', '2025-26'],
    year: '2026-27',
    onYear: vi.fn(),
    onSettleYear: vi.fn(async () => ({ settled: [{ employeeId: 'e1', component: 'phone', paidTaxable: '9450.00', carriedOut: '0.00', lapsed: '0.00' }] })),
    onSettleExit: vi.fn(async (id: string) => ({ settled: [{ employeeId: id, component: 'phone', paidTaxable: '2400.00', carriedOut: '0.00', lapsed: '0.00' }] })),
    onLedger: vi.fn(async () => LEDGER),
    ...over,
  });

  it('no access and empty are the designed states', () => {
    const { rerender } = render(<FlexSettlementScreen live={pay({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access to flexible benefit settlement/)).toBeInTheDocument();
    rerender(<FlexSettlementScreen live={pay({ data: { ...OVERVIEW, people: [] } })} />);
    expect(screen.getByText('No one to settle')).toBeInTheDocument();
  });

  it('before March: the opening month is said; pressing still asks and a refusal stays in the dialog', async () => {
    const v = pay({ onSettleYear: vi.fn(async () => Promise.reject(new Error('The year-end settlement for 2026-27 opens with the March 2027 pay month.'))) });
    render(<FlexSettlementScreen live={v} />);
    expect(screen.getByText('Opens with the March 2027 pay month')).toBeInTheDocument();
    // Only the people staying are in the year-end list; the left total leaves out leavers.
    expect(screen.queryByText('Meera Pillai')).not.toBeInTheDocument();
    expect(screen.getByText('₹13,350.00')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Settle the year' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle the year' }));
    expect(await within(screen.getByRole('dialog')).findByText(/opens with the March 2027 pay month/)).toBeInTheDocument();
  });

  it('in March: settles the year; a toast says what goes to payroll', async () => {
    const v = pay({ data: { ...OVERVIEW, open: true } });
    render(<FlexSettlementScreen live={v} />);
    expect(screen.queryByText('Opens with the March 2027 pay month')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Settle the year' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle the year' }));
    await waitFor(() => expect(v.onSettleYear).toHaveBeenCalled());
    expect(await screen.findByText('FY 2026-27: 1 benefit settled')).toBeInTheDocument();
  });

  it('leavers: a settled leaver has no button; an unsettled one is settled at exit; a row opens the ledger', async () => {
    const v = pay();
    render(<FlexSettlementScreen live={v} />);
    await ue.click(screen.getByRole('radio', { name: 'Leavers (2)' }));
    expect(screen.getByText('Settled at exit')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Settle' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Settle' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle' }));
    await waitFor(() => expect(v.onSettleExit).toHaveBeenCalledWith('e5'));
    await ue.click(screen.getByText('Karthik Iyer'));
    await waitFor(() => expect(v.onLedger).toHaveBeenCalledWith('e4'));
    expect(await within(screen.getByRole('dialog')).findByText('Phone and internet')).toBeInTheDocument();
  });
});
