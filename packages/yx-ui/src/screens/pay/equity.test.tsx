import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EquityScreen, MyEquityScreen, SAMPLE_EQUITY, SAMPLE_GRANTS, pricePayable, type LiveEquity, type LiveMyEquity } from './equity';

// PAY-57 / PAY-58 with the live app's data: what the live pages must do.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}));
const NAMES: Record<string, string> = { p1: 'Lakshmi Devi', p2: 'Ravi Kumar', p3: 'Arjun Nair' };
const live = (over: Partial<LiveEquity> = {}): LiveEquity => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }],
  entityId: 'e1',
  onEntity: vi.fn(),
  nameOf: (id) => NAMES[id] ?? 'Someone',
  onSearch: vi.fn(async () => [{ id: 'p3', name: 'Arjun Nair', employeeCode: 'KF-003' }]),
  data: SAMPLE_EQUITY,
  onPlan: fn(),
  onValuation: fn(),
  onGrant: fn(),
  onConfirm: fn(),
  onPaid: fn(),
  onCapTable: fn(),
  ...over,
});
const drawer = () => screen.getByRole('dialog');

describe('price payable is exact', () => {
  it('units × a 4-decimal price, to the paisa, half up', () => {
    expect(pricePayable(3, '12.3456')).toBe('37.04');
    expect(pricePayable(50, '10.0000')).toBe('500.00');
    expect(pricePayable(1, '0.0050')).toBe('0.01');
    expect(pricePayable(1, '0.0049')).toBe('0.00');
  });
});

describe('PAY-57 Equity, live', () => {
  it('loading, could not load (Retry calls the page), no access', async () => {
    const v = live({ state: 'loading' });
    const { rerender } = render(<EquityScreen live={v} />);
    expect(screen.getByRole('status', { name: 'Loading equity' })).toBeInTheDocument();
    rerender(<EquityScreen live={{ ...v, state: 'error' }} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(v.onRetry).toHaveBeenCalled();
    rerender(<EquityScreen live={{ ...v, state: 'no-access' }} />);
    expect(screen.getByText(/You don't have access to equity/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make a grant' })).not.toBeInTheDocument();
  });

  it('empty: a grant needs a plan first (a warning, never a greyed-out button)', async () => {
    const v = live({ data: { plans: [], valuations: [], grants: [] } });
    render(<EquityScreen live={v} />);
    expect(screen.getByText('No grants yet')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Make a grant' })[0]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await screen.findAllByText('Add a plan first')).length).toBeGreaterThan(0);
  });

  it('a pending grant says who approves it: never the person who made it', () => {
    render(<EquityScreen live={live()} />);
    expect(screen.getByText('You made it, so another equity admin approves it in Approvals')).toBeInTheDocument();
  });

  it('make a grant: errors and focus when pressed too early; over the pool is refused; then the exact payload', async () => {
    const v = live();
    render(<EquityScreen live={v} />);
    await ue.click(screen.getByRole('button', { name: 'Make a grant' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByText('Choose the person.')).toBeInTheDocument();
    expect(v.onGrant).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: 'Find a person' }), 'Arj');
    await ue.click(within(drawer()).getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: 'Arjun Nair · KF-003' }));
    await ue.type(screen.getByLabelText(/Granted on/), '2026-11-01');
    await ue.type(screen.getByRole('textbox', { name: /^Units/ }), '401');
    await ue.type(screen.getByRole('textbox', { name: /Exercise price/ }), '12.5');
    await ue.click(within(drawer()).getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByText('1 to 400 units (what is left in the pool).')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Units/ })).toHaveFocus();
    await ue.clear(screen.getByRole('textbox', { name: /^Units/ }));
    await ue.type(screen.getByRole('textbox', { name: /^Units/ }), '100');
    await ue.click(within(drawer()).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(v.onGrant).toHaveBeenCalledWith({ planId: 'pl1', employeeId: 'p3', grantedOn: '2026-11-01', units: 100, exercisePrice: '12.5', cliffMonths: 12, vestingMonths: 48, everyMonths: 3 }));
  });

  it('add a plan and a valuation: field errors first, then the exact payloads', async () => {
    const v = live();
    render(<EquityScreen live={v} />);
    await ue.click(screen.getByRole('tab', { name: /Plans/ }));
    await ue.click(screen.getByRole('button', { name: 'Add a plan' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Add plan' }));
    expect(screen.getByText('Name the plan.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus();
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'RSU 2027');
    await ue.click(screen.getByRole('radio', { name: 'RSU' }));
    await ue.type(screen.getByRole('textbox', { name: /Pool/ }), '5000');
    await ue.click(within(drawer()).getByRole('button', { name: 'Add plan' }));
    await waitFor(() => expect(v.onPlan).toHaveBeenCalledWith({ name: 'RSU 2027', kind: 'RSU', poolUnits: 5000, exitWindowDays: 90 }));
    await ue.click(screen.getAllByRole('button', { name: 'Cap table' })[0]!);
    await waitFor(() => expect(v.onCapTable).toHaveBeenCalledWith('pl1'));
  });

  it('a valuation of 0 is refused; a good one is sent as typed', async () => {
    const v = live();
    render(<EquityScreen live={v} tab="valuations" />);
    await ue.click(screen.getByRole('tab', { name: /Valuations/ }));
    await ue.click(screen.getByRole('button', { name: 'Add a valuation' }));
    await ue.type(within(drawer()).getByLabelText(/Valued on/), '2026-10-01');
    await ue.type(screen.getByRole('textbox', { name: /Fair market value/ }), '0');
    await ue.click(within(drawer()).getByRole('button', { name: 'Add valuation' }));
    expect(screen.getByText(/more than 0/)).toBeInTheDocument();
    expect(v.onValuation).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /Fair market value/ }));
    await ue.type(screen.getByRole('textbox', { name: /Fair market value/ }), '260.1234');
    await ue.click(within(drawer()).getByRole('button', { name: 'Add valuation' }));
    await waitFor(() => expect(v.onValuation).toHaveBeenCalledWith({ valuedOn: '2026-10-01', fmv: '260.1234', basis: 'merchant_banker' }));
  });

  it('confirm a milestone asks first, then vests it; price received needs a reference', async () => {
    const v = live();
    render(<EquityScreen live={v} />);
    await ue.click(screen.getByRole('button', { name: 'Confirm Series B closed' }));
    expect(screen.getByText(/50 units vest now/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Confirm vesting' }));
    await waitFor(() => expect(v.onConfirm).toHaveBeenCalledWith('e4'));
    await ue.click(screen.getByRole('button', { name: 'Price received (50 units)' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Record payment' }));
    expect(screen.getByRole('textbox', { name: /Payment reference/ })).toHaveFocus();
    expect(v.onPaid).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Payment reference/ }), 'UTR-7788');
    await ue.click(within(drawer()).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(v.onPaid).toHaveBeenCalledWith('x1', 'UTR-7788'));
  });
});

describe('PAY-58 My equity, live', () => {
  const mine = (over: Partial<LiveMyEquity> = {}): LiveMyEquity => ({ state: 'ready', onRetry: vi.fn(), data: [SAMPLE_GRANTS[0]!], onExercise: fn(), ...over });

  it('loading, could not load, empty', async () => {
    const v = mine({ state: 'loading', data: null });
    const { rerender } = render(<MyEquityScreen live={v} />);
    expect(screen.getByRole('status', { name: 'Loading your equity' })).toBeInTheDocument();
    rerender(<MyEquityScreen live={{ ...v, state: 'error' }} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(v.onRetry).toHaveBeenCalled();
    rerender(<MyEquityScreen live={{ ...v, data: [], state: 'ready' }} />);
    expect(screen.getByText('No grants')).toBeInTheDocument();
  });

  it('shows vesting; exercising more than vested is refused, then the exact units with the price payable', async () => {
    const v = mine();
    render(<MyEquityScreen live={v} />);
    expect(screen.getByText('When: Series B closed')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Exercise' }));
    await ue.type(screen.getByRole('textbox', { name: /Units/ }), '151');
    await ue.click(within(drawer()).getByRole('button', { name: 'Ask to exercise' }));
    expect(screen.getByText('1 to 150 units.')).toBeInTheDocument();
    expect(v.onExercise).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /Units/ }));
    await ue.type(screen.getByRole('textbox', { name: /Units/ }), '30');
    expect(screen.getByText(/Price payable ₹300.00/)).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Ask to exercise' }));
    await waitFor(() => expect(v.onExercise).toHaveBeenCalledWith('g1', 30));
  });

  it('no Exercise button when nothing is vested to exercise', () => {
    render(<MyEquityScreen live={mine({ data: [SAMPLE_GRANTS[2]!] })} />);
    expect(screen.queryByRole('button', { name: 'Exercise' })).not.toBeInTheDocument();
  });
});
