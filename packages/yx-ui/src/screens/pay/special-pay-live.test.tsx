import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SpecialPayHomeScreen } from './special-pay';
import { incentivePay, type LiveSpecialPay } from './special-pay-live';
import type { SpecialPosting } from './live/types-5i';

// PAY-50 special pay home and its PAY-31 … 37 tabs with the live app's data: what /yx/payroll/special-pay must do.
// Positive and negative paths for every tab (ported from the old SpecialPayScreen copy, plus the designed states).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
const POSTINGS: SpecialPosting[] = [
  { id: 'sp1', kind: 'piece', month: '2026-10', sourceRef: 'piece:e1:2026-10', lines: [{ employeeId: 'p1', componentCode: 'piece_pay', amount: '14250.00', label: 'Piece-rate pay for 24 days in 2026-10.' }, { employeeId: 'p2', componentCode: 'min_wage_topup', amount: '610.00', label: 'Top-up to the minimum wage.' }], total: '14860.00', status: 'pending', madeByMe: true, createdAt: '2026-10-12T05:00:00.000Z' },
  { id: 'sp2', kind: 'union', month: '2026-10', sourceRef: 'union:e1:2026-10', lines: [{ employeeId: 'p1', componentCode: 'union_dues', amount: '50.00', label: 'Garment Workers Union dues.' }], total: '50.00', status: 'approved', madeByMe: false, createdAt: '2026-10-10T05:00:00.000Z' },
];
const names: Record<string, string> = { p1: 'Lakshmi Devi', p2: 'Ravi Kumar' };
const live = (o: Partial<LiveSpecialPay> = {}): LiveSpecialPay => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'e1', name: 'Kaveri Garments Pvt Ltd', keys: ['payroll.special.manage'] } as never],
  entityId: 'e1',
  onEntity: vi.fn(),
  month: '2026-10',
  onMonth: vi.fn(),
  locations: [{ id: 'l1', name: 'Peenya unit' }],
  nameOf: (id) => names[id] ?? 'Someone',
  onSearch: vi.fn(async () => [{ id: 'p1', name: 'Lakshmi Devi', employeeCode: 'GW-014' }]),
  postings: POSTINGS,
  cards: [{ id: 'c1', operationCode: 'STITCH', name: 'Stitch a shirt', unit: 'piece', rate: '2.5000', validFrom: '2026-04-01', validTo: null }],
  outputs: [{ id: 'o1', employeeId: 'p1', workDate: '2026-10-03', operationCode: 'STITCH', quantity: '120', source: 'keyed' }],
  plans: [{ id: 'pl1', name: 'South sales 2026-27', kind: 'sales', metric: 'sales value', targetAmount: '20000.00', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], capPercent: '200', clawbackDays: 90, status: 'active' }],
  pools: [
    { id: 'tp1', locationId: 'l1', month: '2026-10', amount: '9000.00', method: 'hours', paidDirect: false, posting: null, shares: [{ employeeId: 'p1', basis: '100', amount: '6000.00' }, { employeeId: 'p2', basis: '50', amount: '3000.00' }] },
    { id: 'tp2', locationId: 'l1', month: '2026-10', amount: '1200.00', method: 'points', paidDirect: true, posting: null, shares: [{ employeeId: 'p1', basis: '1', amount: '1200.00' }] },
  ],
  unions: {
    unions: [{ id: 'u1', name: 'Garment Workers Union', registrationNo: 'KA-123', members: 2 }],
    authorisations: [
      { id: 'a1', unionId: 'u1', employeeId: 'p1', duesKind: 'fixed', duesValue: '50.00', validFrom: '2026-04-01', revokedOn: null },
      { id: 'a2', unionId: 'u1', employeeId: 'p2', duesKind: 'percent', duesValue: '1.00', validFrom: '2026-04-01', revokedOn: '2026-09-01' },
    ],
    settlements: [{ id: 's1', unionId: 'u1', title: '2026 wage settlement', effectiveFrom: '2026-04-01', signedOn: '2026-09-20', rates: [{ category: 'skilled', monthlyIncrease: '1500' }, { category: 'unskilled', monthlyIncrease: '1200' }] }],
  },
  oncallRules: [{ id: 'r1', name: 'Maintenance on-call', standbyAmount: '500.00', calloutMinHours: '3', calloutRate: '200.00', multiplier: '1.5' }],
  onAddCard: ok(),
  onSaveOutput: ok(),
  onImportOutputs: ok(),
  onAddPlan: ok(),
  onSaveResult: ok(),
  onAddPool: vi.fn(async () => ({ id: 'tp9' })),
  onAddRule: ok(),
  onAddSlot: ok(),
  onAddUnion: ok(),
  onAuthorise: ok(),
  onRevoke: ok(),
  onRemittance: vi.fn(async () => ({ union: 'Garment Workers Union', month: '2026-10', approved: true, members: [{ employeeId: 'p1', amount: '50.00' }], total: '50.00' })),
  onLayoff: ok(),
  onVrs: ok(),
  onPost: ok(),
  ...o,
});
const tab = async (name: string) => ue.click(screen.getByRole('tab', { name }));
const drawer = () => screen.getAllByRole('dialog')[0];
const pick = async (label: string) => {
  await ue.type(within(drawer()).getByRole('textbox', { name: `Find ${label}` }), 'Lak');
  await ue.click(within(drawer()).getByRole('button', { name: 'Search' }));
  await ue.click(await within(drawer()).findByRole('button', { name: 'Lakshmi Devi · GW-014' }));
};

describe('Special pay home (PAY-50 live)', () => {
  it('shows the sheets sent to payroll with their status, and their lines', async () => {
    render(<SpecialPayHomeScreen live={live()} />);
    const table = screen.getByRole('table', { name: /Special pay sent to payroll, October 2026/ });
    expect(within(table).getAllByText('Piece-rate pay').length).toBeGreaterThan(0);
    expect(within(table).getByText('Sent by you')).toBeInTheDocument();
    expect(within(table).getByText('Approved, in payroll')).toBeInTheDocument();
    await ue.click(within(table).getAllByRole('button', { name: 'Lines' })[0]);
    expect(within(drawer()).getByText('Top-up to the minimum wage.')).toBeInTheDocument();
    expect(within(drawer()).getByText('Ravi Kumar')).toBeInTheDocument();
  });

  it('opens a special pay type from its card', async () => {
    render(<SpecialPayHomeScreen live={live()} />);
    await ue.click(screen.getByRole('button', { name: 'Open piece-rate pay' }));
    expect(await screen.findByRole('table', { name: 'Rate cards' })).toBeInTheDocument();
  });

  it('says so when nothing was sent this month', () => {
    render(<SpecialPayHomeScreen live={live({ postings: [] })} />);
    expect(screen.getByText('Nothing sent to payroll this month')).toBeInTheDocument();
  });

  it('asks for a legal entity first', () => {
    render(<SpecialPayHomeScreen live={live({ entityId: null })} />);
    expect(screen.getByText('No legal entity chosen')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('shows an error with Retry, and no access without the key', async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<SpecialPayHomeScreen live={live({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    render(<SpecialPayHomeScreen live={live({ state: 'no-access' })} />);
    expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });

  it('records lay-off days; pressed too early it shows the errors and focuses the first field', async () => {
    const onLayoff = ok();
    render(<SpecialPayHomeScreen live={live({ onLayoff })} />);
    await ue.click(screen.getByRole('button', { name: 'Record lay-off days' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save days' }));
    expect(within(drawer()).getAllByText('Choose the person.').length).toBeGreaterThan(0);
    expect(within(drawer()).getAllByText(/Lay-off days in whole or half days/).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement?.id).toBe('lo-who'));
    expect(onLayoff).not.toHaveBeenCalled();
    await pick('person');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Days laid off/ }), '3');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save days' }));
    await waitFor(() => expect(onLayoff).toHaveBeenCalledWith({ employeeId: 'p1', days: '3' }));
    expect((await screen.findAllByText('3 lay-off days saved for Lakshmi Devi.')).length).toBeGreaterThan(0);
  });

  it('pays VRS with the exemption left of the lifetime limit', async () => {
    const onVrs = ok();
    render(<SpecialPayHomeScreen live={live({ onVrs })} />);
    await ue.click(screen.getByRole('button', { name: 'Pay VRS' }));
    await pick('person');
    await ue.type(within(drawer()).getByRole('textbox', { name: /VRS compensation/ }), '100000');
    const prior = within(drawer()).getByRole('textbox', { name: /Exemption claimed before/ });
    await ue.clear(prior);
    await ue.type(prior, '450000');
    expect(within(drawer()).getAllByText('₹50,000')).toHaveLength(2);
    await ue.click(within(drawer()).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onVrs).toHaveBeenCalledWith({ employeeId: 'p1', amount: '100000', priorExemption: '450000' }));
  });

  it('sends the month’s lay-off pay, and shows the API refusal', async () => {
    const onPost = vi.fn().mockRejectedValueOnce(new Error('Nothing to send for October.')).mockResolvedValue({});
    render(<SpecialPayHomeScreen live={live({ onPost })} />);
    await ue.click(screen.getByRole('button', { name: 'Send lay-off pay' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send to payroll' }));
    expect(await screen.findByText(/Nothing to send for October/)).toBeInTheDocument();
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onPost).toHaveBeenLastCalledWith({ kind: 'layoff' }));
    expect((await screen.findAllByText('October 2026 lay-off pay sent to payroll for approval.')).length).toBeGreaterThan(0);
  });
});

describe('Piece-rate tab (PAY-31 live)', () => {
  it('lists rate cards and output, adds a card and sends the month', async () => {
    const onAddCard = ok();
    const onPost = ok();
    render(<SpecialPayHomeScreen live={live({ onAddCard, onPost })} />);
    await tab('Piece-rate');
    expect(screen.getByText('STITCH · Stitch a shirt')).toBeInTheDocument();
    expect(screen.getByText('₹2.5 a piece')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add rate card' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save rate card' }));
    expect(within(drawer()).getAllByText('Name the operation.').length).toBeGreaterThan(0);
    expect(onAddCard).not.toHaveBeenCalled();
    await ue.type(within(drawer()).getByRole('textbox', { name: /Operation code/ }), 'hem');
    await ue.type(within(drawer()).getAllByRole('textbox', { name: /^Operation/ })[1], 'Hem a sleeve');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Rate/ }), '3');
    await ue.type(within(drawer()).getByLabelText(/Valid from/), '2026-11-01');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save rate card' }));
    await waitFor(() => expect(onAddCard).toHaveBeenCalledWith({ operationCode: 'HEM', name: 'Hem a sleeve', unit: 'piece', rate: '3', validFrom: '2026-11-01' }));
    await tab('Output');
    expect(screen.getByRole('table', { name: 'Output this period' })).toHaveTextContent('Lakshmi Devi');
    await ue.click(screen.getByRole('button', { name: 'Send October 2026 to payroll' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith({ kind: 'piece' }));
  });

  it('shows the empty states, and an import the API refused', async () => {
    const onImportOutputs = vi.fn(async () => {
      throw new Error('Row 3: no rate card for GLAZE.');
    });
    const { container } = render(<SpecialPayHomeScreen live={live({ cards: [], outputs: [], onImportOutputs })} />);
    await tab('Piece-rate');
    expect(screen.getByText('No rate cards yet')).toBeInTheDocument();
    const file = new File(['employee_code,date,operation,quantity'], 'out.csv', { type: 'text/csv' });
    await ue.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    expect(await screen.findByText(/no rate card for GLAZE/)).toBeInTheDocument();
  });

  it('will not key output without a rate card', async () => {
    const onSaveOutput = ok();
    render(<SpecialPayHomeScreen live={live({ cards: [], onSaveOutput })} />);
    await tab('Piece-rate');
    await ue.click(screen.getByRole('button', { name: 'Key output' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save output' }));
    expect(within(drawer()).getAllByText(/Add a rate card first/).length).toBeGreaterThan(0);
    expect(onSaveOutput).not.toHaveBeenCalled();
  });
});

describe('Incentives tab (PAY-32 live)', () => {
  it('works out pay like the API: bands, threshold, accelerator and cap', () => {
    expect(incentivePay(10_000, [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], null, 120)).toEqual({ amount: 13_000, capped: false });
    expect(incentivePay(10_000, [{ from: 0, multiplier: 0 }, { from: 50, multiplier: 2 }], 150, 120)).toEqual({ amount: 14_000, capped: false });
    expect(incentivePay(10_000, [{ from: 0, multiplier: 0 }, { from: 50, multiplier: 2 }], 100, 120)).toEqual({ amount: 10_000, capped: true });
    expect(incentivePay(10_000, [{ from: 0, multiplier: 1 }], null, 0)).toEqual({ amount: 0, capped: false });
  });

  it('lists plans, adds a result and sends the month', async () => {
    const onSaveResult = ok();
    const onPost = ok();
    render(<SpecialPayHomeScreen live={live({ onSaveResult, onPost })} />);
    await tab('Incentives');
    expect(screen.getByText('South sales 2026-27')).toBeInTheDocument();
    expect(screen.getByText('200 % of target')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add a result' }));
    await pick('person');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Quota/ }), '100000');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Achieved/ }), '120000');
    expect(within(drawer()).getByText('₹26,000')).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(onSaveResult).toHaveBeenCalledWith('pl1', { employeeId: 'p1', quota: '100000', actual: '120000' }));
    await ue.click(screen.getByRole('button', { name: 'Send month' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith({ kind: 'plan', id: 'pl1' }));
  });

  it('publishes a new plan, and refuses tiers that do not go up', async () => {
    const onAddPlan = ok();
    render(<SpecialPayHomeScreen live={live({ onAddPlan })} />);
    await tab('Incentives');
    await ue.click(screen.getByRole('button', { name: 'New plan' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /^Name/ }), 'Plant output');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Measured on/ }), 'pieces');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Target pay/ }), '5000');
    const t2 = within(drawer()).getByRole('textbox', { name: 'Tier 2 starts at' });
    await ue.clear(t2);
    await ue.type(t2, '0');
    await ue.click(within(drawer()).getByRole('button', { name: 'Publish plan' }));
    expect(within(drawer()).getAllByText(/Tier 2 must start above tier 1/).length).toBeGreaterThan(0);
    expect(onAddPlan).not.toHaveBeenCalled();
    await ue.clear(t2);
    await ue.type(t2, '100');
    await ue.click(within(drawer()).getByRole('button', { name: 'Publish plan' }));
    await waitFor(() => expect(onAddPlan).toHaveBeenCalledWith({ name: 'Plant output', kind: 'sales', metric: 'pieces', targetAmount: '5000', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], clawbackDays: 90 }));
  });

  it('says so when there is no plan', async () => {
    render(<SpecialPayHomeScreen live={live({ plans: [] })} />);
    await tab('Incentives');
    expect(screen.getByText('No incentive plans yet')).toBeInTheDocument();
  });
});

describe('Tips tab (PAY-34 live)', () => {
  it('lists pools; a pool not yet sent can be sent, a record-only pool cannot', async () => {
    const onPost = ok();
    render(<SpecialPayHomeScreen live={live({ onPost })} />);
    await tab('Tips');
    const table = screen.getByRole('table', { name: 'Tip pools' });
    expect(within(table).getByText('Not sent')).toBeInTheDocument();
    expect(within(table).getByText('Record only')).toBeInTheDocument();
    await ue.click(within(table).getAllByRole('button', { name: 'Open pool' })[0]);
    expect(within(drawer()).getByText('₹6,000')).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Send to payroll' }));
    await ue.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith({ kind: 'pool', id: 'tp1' }));
    await ue.click(within(drawer()).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await ue.click(within(table).getAllByRole('button', { name: 'Open pool' })[1]);
    expect(within(drawer()).queryByRole('button', { name: 'Send to payroll' })).not.toBeInTheDocument();
  });

  it('creates a pool: pressed too early it shows errors; record-only is not sent', async () => {
    const onAddPool = vi.fn(async () => ({ id: 'tp9' }));
    const onPost = ok();
    render(<SpecialPayHomeScreen live={live({ onAddPool, onPost })} />);
    await tab('Tips');
    await ue.click(screen.getAllByRole('button', { name: 'New pool' })[0]);
    await ue.click(within(drawer()).getByRole('button', { name: 'Create and send' }));
    expect(within(drawer()).getAllByText(/The amount in the pool/).length).toBeGreaterThan(0);
    expect(onAddPool).not.toHaveBeenCalled();
    await ue.type(within(drawer()).getByRole('textbox', { name: /Amount/ }), '1500');
    await ue.click(within(drawer()).getByRole('checkbox', { name: /Paid by customers directly/ }));
    await pick('person 1');
    await ue.type(within(drawer()).getByRole('textbox', { name: /^Hours/ }), '8');
    await ue.click(within(drawer()).getByRole('button', { name: 'Record pool' }));
    await waitFor(() => expect(onAddPool).toHaveBeenCalledWith({ locationId: 'l1', amount: '1500', method: 'hours', paidDirect: true, shares: [{ employeeId: 'p1', basis: '8' }] }));
    expect(onPost).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    render(<SpecialPayHomeScreen live={live({ pools: [] })} />);
    await tab('Tips');
    expect(screen.getByText('No tip pools for October 2026 yet')).toBeInTheDocument();
  });
});

describe('On-call tab (PAY-35 live)', () => {
  it('lists rules with a worked example and records a slot', async () => {
    const onAddSlot = ok();
    render(<SpecialPayHomeScreen live={live({ onAddSlot })} />);
    await tab('On-call');
    expect(screen.getByText('₹500 a slot')).toBeInTheDocument();
    // 1 h called out → the 3 h minimum × ₹200 × 1.5 = ₹900, plus ₹500 standby.
    expect(screen.getByText('₹1,400')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record a slot' }));
    await pick('person');
    await ue.type(within(drawer()).getByLabelText(/^Day/), '2026-10-04');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save slot' }));
    await waitFor(() => expect(onAddSlot).toHaveBeenCalledWith({ ruleId: 'r1', employeeId: 'p1', slotDate: '2026-10-04' }));
  });

  it('with no rules: an empty state, no slot button; a bad multiplier is refused', async () => {
    const onAddRule = ok();
    render(<SpecialPayHomeScreen live={live({ oncallRules: [], onAddRule })} />);
    await tab('On-call');
    expect(screen.getByText('No on-call rules yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record a slot' })).not.toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Add rule' })[0]);
    const mult = within(drawer()).getByRole('textbox', { name: /Normal-day multiplier/ });
    await ue.clear(mult);
    await ue.type(mult, '0.5');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save rule' }));
    expect(within(drawer()).getAllByText('The multiplier, at least 1.').length).toBeGreaterThan(0);
    expect(onAddRule).not.toHaveBeenCalled();
  });
});

describe('On-call holiday rules (PAY-35 Holiday live)', () => {
  it('the worked example uses the holiday multiplier on a public holiday; standby is not paid when called out if the rule says so', async () => {
    const rules = [{ id: 'r1', name: 'Maintenance on-call', standbyAmount: '500.00', calloutMinHours: '3', calloutRate: '200.00', multiplier: '1.5', holidayMultiplier: '2', payStandbyWhenCalled: false, countTowardsWeekly: true }];
    render(<SpecialPayHomeScreen live={live({ oncallRules: rules })} />);
    await tab('On-call');
    // Normal day, 1 h called out: 3 h × ₹200 × 1.5 = ₹900, no standby.
    expect(screen.getAllByText('₹900').length).toBeGreaterThan(0);
    expect(screen.getByText('₹0 (not paid when called out)')).toBeInTheDocument();
    expect(screen.getByText(/count towards the person's weekly hours limit/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Public holiday' }));
    // Holiday: 3 h × ₹200 × 2 = ₹1,200.
    expect(screen.getAllByText('₹1,200').length).toBeGreaterThan(0);
  });

  it('a holiday multiplier below the normal one is refused (negative); a good rule is sent with its choices; a slot can be a holiday', async () => {
    const onAddRule = ok();
    const onAddSlot = ok();
    render(<SpecialPayHomeScreen live={live({ onAddRule, onAddSlot })} />);
    await tab('On-call');
    await ue.click(screen.getAllByRole('button', { name: 'Add rule' })[0]);
    await ue.type(within(drawer()).getByRole('textbox', { name: /^Name/ }), 'Night standby');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Standby pay per slot/ }), '400');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Call-out hourly rate/ }), '250');
    await ue.type(within(drawer()).getByRole('textbox', { name: /Public holiday multiplier/ }), '1.2');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save rule' }));
    expect(within(drawer()).getAllByText('Must be at least the normal-day multiplier (1.5×).').length).toBeGreaterThan(0);
    expect(onAddRule).not.toHaveBeenCalled();
    const h = within(drawer()).getByRole('textbox', { name: /Public holiday multiplier/ });
    await ue.clear(h);
    await ue.type(h, '2');
    await ue.click(within(drawer()).getByRole('checkbox', { name: /Pay standby even when/ }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(onAddRule).toHaveBeenCalledWith({ name: 'Night standby', standbyAmount: '400', calloutMinHours: '3', calloutRate: '250', multiplier: '1.5', holidayMultiplier: '2', payStandbyWhenCalled: false, countTowardsWeekly: false }));
    await ue.click(screen.getByRole('button', { name: 'Record a slot' }));
    await pick('person');
    await ue.type(within(drawer()).getByLabelText(/^Day/), '2026-10-02');
    await ue.click(within(drawer()).getByRole('checkbox', { name: /public holiday/ }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save slot' }));
    await waitFor(() => expect(onAddSlot).toHaveBeenCalledWith({ ruleId: 'r1', employeeId: 'p1', slotDate: '2026-10-02', onHoliday: true }));
  });
});

describe('Union dues tab (PAY-36 live)', () => {
  it('shows authorisations, withdraws one, and opens the remittance statement', async () => {
    const onRevoke = ok();
    const onRemittance = live().onRemittance!;
    render(<SpecialPayHomeScreen live={live({ onRevoke, onRemittance })} />);
    await tab('Union dues');
    const auths = screen.getByRole('table', { name: 'Check-off authorisations' });
    expect(within(auths).getByText('Withdrawn')).toBeInTheDocument();
    expect(within(auths).getByText('From 1 Sept 2026')).toBeInTheDocument();
    await ue.click(within(auths).getByRole('button', { name: 'Withdraw' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Withdraw' }));
    expect(within(drawer()).getAllByText('The day the withdrawal takes effect.').length).toBeGreaterThan(0);
    await ue.type(within(drawer()).getByLabelText(/^From/), '2026-11-01');
    await ue.click(within(drawer()).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith('a1', '2026-11-01'));
    await ue.click(screen.getByRole('tab', { name: /October 2026 deductions/ }));
    expect(screen.getByRole('table', { name: 'October 2026 check-off deductions' })).toHaveTextContent('Lakshmi Devi');
    expect(screen.getByRole('table', { name: 'October 2026 check-off deductions' })).not.toHaveTextContent('Ravi Kumar');
    await tab('Remittance');
    await ue.click(screen.getByRole('button', { name: 'Statement' }));
    expect(await within(drawer()).findByText('Dues approved in payroll', { exact: false })).toBeInTheDocument();
    expect(onRemittance).toHaveBeenCalledWith('u1');
  });

  it('refuses a per cent of 100 or more, and with no union shows how to start', async () => {
    const onAuthorise = ok();
    const { unmount } = render(<SpecialPayHomeScreen live={live({ onAuthorise })} />);
    await tab('Union dues');
    await ue.click(screen.getByRole('button', { name: 'Add authorisation' }));
    await ue.click(within(drawer()).getByRole('radio', { name: 'Per cent of basic and DA' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /Per cent/ }), '100');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save authorisation' }));
    expect(within(drawer()).getAllByText('The per cent of basic and DA, below 100.').length).toBeGreaterThan(0);
    expect(onAuthorise).not.toHaveBeenCalled();
    unmount();
    render(<SpecialPayHomeScreen live={live({ unions: { unions: [], authorisations: [], settlements: [] } })} />);
    await tab('Union dues');
    expect(screen.getByText('No unions yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add authorisation' })).not.toBeInTheDocument();
  });
});

describe('Settlements tab (PAY-37 live)', () => {
  it('shows the categories and sends the arrears; a refusal stays on screen', async () => {
    const onPost = vi.fn().mockRejectedValueOnce(new Error('The month is locked.')).mockResolvedValue({});
    render(<SpecialPayHomeScreen live={live({ onPost })} />);
    await tab('Settlements');
    expect(screen.getByText('2026 wage settlement')).toBeInTheDocument();
    expect(screen.getByText('₹1,500')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('navigation', { name: 'Settlement arrears steps' })).getByRole('button', { name: /Arrears/ }));
    const send = await screen.findByRole('button', { name: 'Send arrears to October 2026' });
    await ue.click(send);
    expect(await screen.findByText('The month is locked.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send arrears to October 2026' }));
    await waitFor(() => expect(onPost).toHaveBeenLastCalledWith({ kind: 'settlement', id: 's1' }));
  });

  it('says so when there is no settlement', async () => {
    render(<SpecialPayHomeScreen live={live({ unions: { unions: [], authorisations: [], settlements: [] } })} />);
    await tab('Settlements');
    expect(screen.getByText('No wage settlements yet')).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------------------------------ round 2 (founder answers 2 and 4)

describe('Earnings check (PAY-31 live, GET piece/check)', () => {
  const CHECK = { month: '2026-10', sent: null, totalTopUp: '150.00', people: [{ employeeId: 'p1', daysWorked: 24, minimumDaily: '600.00', earnings: '14250.00', minimum: '14400.00', topUp: '150.00' }, { employeeId: 'p2', daysWorked: 2, minimumDaily: '600.00', earnings: '1200.00', minimum: '1200.00', topUp: '0.00' }] };
  it('shows each worker’s piece pay, the time-rate minimum and the top-up before the month is sent (positive)', async () => {
    const onPieceCheck = vi.fn(async () => ({ ...CHECK, people: [...CHECK.people] }));
    render(<SpecialPayHomeScreen live={live({ onPieceCheck })} />);
    await tab('Piece-rate');
    await ue.click(screen.getByRole('tab', { name: 'Earnings check' }));
    const t = await screen.findByRole('table', { name: 'Piece-rate earnings check' });
    await within(t).findByText('Lakshmi Devi');
    expect(t).toHaveTextContent('₹14,250');
    expect(t).toHaveTextContent('₹150');
    expect(screen.getByText(/Daily minimum ₹600/)).toBeInTheDocument();
    expect(onPieceCheck).toHaveBeenCalledTimes(1);
  });

  it('shows the API refusal (an output with no rate) and tries again (negative)', async () => {
    const onPieceCheck = vi.fn().mockRejectedValueOnce(new Error('No piece rate in force for NOPE on 2026-10-03.')).mockResolvedValue({ ...CHECK, people: [...CHECK.people] });
    render(<SpecialPayHomeScreen live={live({ onPieceCheck })} />);
    await tab('Piece-rate');
    await ue.click(screen.getByRole('tab', { name: 'Earnings check' }));
    expect(await screen.findByText('No piece rate in force for NOPE on 2026-10-03.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Piece-rate earnings check' })).toBeInTheDocument();
    expect(onPieceCheck).toHaveBeenCalledTimes(2);
  });
});

describe('Mark remitted (PAY-36 live)', () => {
  const remit = (o: object = {}) => vi.fn(async () => ({ union: 'Garment Workers Union', month: '2026-10', approved: true, members: [{ employeeId: 'p1', amount: '50.00' }], total: '50.00', remitted: null, ...o }));
  it('marks an approved month remitted; pressed too early the fields say what is missing and the first takes focus (positive and negative)', async () => {
    const onMarkRemitted = ok();
    render(<SpecialPayHomeScreen live={live({ onRemittance: remit(), onMarkRemitted, today: '2026-11-05' })} />);
    await tab('Union dues');
    await tab('Remittance');
    const t = screen.getByRole('table', { name: 'Remittance per union, October 2026' });
    expect(await within(t).findByText('Not remitted')).toBeInTheDocument();
    await ue.click(within(t).getByRole('button', { name: 'Mark remitted' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.click(within(dlg).getByRole('button', { name: 'Mark remitted' }));
    expect(within(dlg).getAllByText('Enter the date it was paid.').length).toBeGreaterThan(0);
    expect(within(dlg).getByLabelText(/Paid on/)).toHaveFocus();
    await ue.type(within(dlg).getByLabelText(/Paid on/), '2026-12-01');
    await ue.type(within(dlg).getByLabelText(/Payment reference/), 'NEFT 1');
    await ue.click(within(dlg).getByRole('button', { name: 'Mark remitted' }));
    expect(within(dlg).getAllByText('The date it was paid cannot be in the future.').length).toBeGreaterThan(0);
    expect(onMarkRemitted).not.toHaveBeenCalled();
    await ue.clear(within(dlg).getByLabelText(/Paid on/));
    await ue.type(within(dlg).getByLabelText(/Paid on/), '2026-11-04');
    await ue.click(within(dlg).getByRole('button', { name: 'Mark remitted' }));
    await waitFor(() => expect(onMarkRemitted).toHaveBeenCalledWith('u1', { paidOn: '2026-11-04', reference: 'NEFT 1' }));
    expect((await screen.findAllByText('Garment Workers Union dues for October 2026 marked remitted.')).length).toBeGreaterThan(0);
  });

  it('a remitted union shows the date and reference with no button; a month not approved has no button; a refusal stays in the dialog', async () => {
    const { unmount } = render(<SpecialPayHomeScreen live={live({ onRemittance: remit({ remitted: { amount: '50.00', paidOn: '2026-11-04', reference: 'NEFT 1', recordedBy: 'x', recordedAt: '' } }), onMarkRemitted: ok() })} />);
    await tab('Union dues');
    await tab('Remittance');
    expect(await screen.findByText('Remitted')).toBeInTheDocument();
    expect(screen.getByText('4 Nov 2026 · NEFT 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark remitted' })).not.toBeInTheDocument();
    unmount();
    const r2 = render(<SpecialPayHomeScreen live={live({ onRemittance: remit({ approved: false }), onMarkRemitted: ok() })} />);
    await tab('Union dues');
    await tab('Remittance');
    expect(await screen.findByText('Not approved yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark remitted' })).not.toBeInTheDocument();
    r2.unmount();
    const onMarkRemitted = vi.fn().mockRejectedValue(new Error('This month is already marked as remitted to this union.'));
    render(<SpecialPayHomeScreen live={live({ onRemittance: remit(), onMarkRemitted, today: '2026-11-05' })} />);
    await tab('Union dues');
    await tab('Remittance');
    await ue.click(await screen.findByRole('button', { name: 'Mark remitted' }));
    const dlg = screen.getAllByRole('dialog').at(-1)!;
    await ue.type(within(dlg).getByLabelText(/Paid on/), '2026-11-04');
    await ue.type(within(dlg).getByLabelText(/Payment reference/), 'NEFT 2');
    await ue.click(within(dlg).getByRole('button', { name: 'Mark remitted' }));
    expect(await within(dlg).findByText('This month is already marked as remitted to this union.')).toBeInTheDocument();
  });
});

describe('New settlement (PAY-37 live)', () => {
  it('adds a settlement; pressed too early the fields say what is missing; categories once each (positive and negative)', async () => {
    const onAddSettlement = ok();
    render(<SpecialPayHomeScreen live={live({ onAddSettlement, today: '2026-10-30' })} />);
    await tab('Settlements');
    await ue.click(screen.getByRole('button', { name: 'New settlement' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save settlement' }));
    expect(within(drawer()).getAllByText(/Name the settlement/).length).toBeGreaterThan(0);
    expect(within(drawer()).getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(onAddSettlement).not.toHaveBeenCalled();
    await ue.type(within(drawer()).getByRole('textbox', { name: /Name/ }), 'Long-term settlement 2026');
    await ue.type(within(drawer()).getByLabelText(/Signed on/), '2026-09-18');
    await ue.type(within(drawer()).getByLabelText(/Increase from/), '2026-04-01');
    await ue.click(within(drawer()).getByRole('combobox', { name: 'Category, row 1' }));
    await ue.click(await screen.findByRole('option', { name: 'Skilled' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /Increase a month/ }), '1500');
    await ue.click(within(drawer()).getByRole('button', { name: 'Add a category' }));
    await ue.click(within(drawer()).getByRole('combobox', { name: 'Category, row 2' }));
    await ue.click(await screen.findByRole('option', { name: 'Skilled' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save settlement' }));
    expect(within(drawer()).getAllByText('Row 2: each category once.').length).toBeGreaterThan(0);
    expect(onAddSettlement).not.toHaveBeenCalled();
    await ue.click(within(drawer()).getByRole('button', { name: 'Remove row 2' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Save settlement' }));
    await waitFor(() => expect(onAddSettlement).toHaveBeenCalledWith({ title: 'Long-term settlement 2026', signedOn: '2026-09-18', effectiveFrom: '2026-04-01', rates: [{ category: 'skilled', monthlyIncrease: '1500' }] }));
    expect((await screen.findAllByText('Long-term settlement 2026 saved.')).length).toBeGreaterThan(0);
  });

  it('a refusal from the server stays in the drawer; with no settlement the empty state offers New settlement', async () => {
    const onAddSettlement = vi.fn().mockRejectedValue(new Error('Each worker category once.'));
    render(<SpecialPayHomeScreen live={live({ onAddSettlement, today: '2026-10-30', unions: { unions: [{ id: 'u1', name: 'Garment Workers Union', registrationNo: 'KA-123', members: 2 }], authorisations: [], settlements: [] } })} />);
    await tab('Settlements');
    expect(screen.getByText('No wage settlements yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'New settlement' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /Name/ }), 'LTS 2026');
    await ue.type(within(drawer()).getByLabelText(/Signed on/), '2026-09-18');
    await ue.type(within(drawer()).getByLabelText(/Increase from/), '2026-04-01');
    await ue.click(within(drawer()).getByRole('combobox', { name: 'Category, row 1' }));
    await ue.click(await screen.findByRole('option', { name: 'Unskilled' }));
    await ue.type(within(drawer()).getByRole('textbox', { name: /Increase a month/ }), '1200');
    await ue.click(within(drawer()).getByRole('button', { name: 'Save settlement' }));
    expect(await within(drawer()).findByText('Each worker category once.')).toBeInTheDocument();
    expect(drawer()).toBeInTheDocument();
  });

  it('without the right to add, there is no New settlement button', async () => {
    render(<SpecialPayHomeScreen live={live({ onAddSettlement: undefined })} />);
    await tab('Settlements');
    expect(screen.queryByRole('button', { name: 'New settlement' })).not.toBeInTheDocument();
  });
});
