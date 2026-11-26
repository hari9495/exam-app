import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActuarialScreen, ArrearsBaseScreen } from './offcycle';
import type { LiveActuarial, LiveArrears } from './offcycle-live';
import type { ActuarialView } from './live/types-5i';
import type { Recovery, Worksheet } from './live/types-5j';
import { ToastProvider } from '../../components/notify';
import { ARREARS_JOBS, RULE_OPEN, RULE_READY } from './arrears-changes-fixtures';

// The designed PAY-28 (arrears list and worksheet) and PAY-38 (actuarial) screens with the live page's data.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const nameOf = (id: string) => ({ p1: 'Lakshmi Devi', p2: 'Ravi Kumar' })[id] ?? 'Someone';
const READY: Worksheet = {
  id: 'w1',
  employeeId: 'p1',
  source: 'change',
  from: '2026-08',
  to: '2026-08',
  status: 'draft',
  total: '4000.00',
  employerCost: '480.00',
  reason: 'Raise approved late',
  missing: 0,
  createdBy: 'u-other',
  lines: [{ id: 'l1', period: '2026-08', componentCode: 'BASIC', kind: 'earning', asPaid: '25000.00', corrected: '29000.00', difference: '4000.00', base: 'import' }],
};
const MISSING: Worksheet = {
  ...READY,
  id: 'w2',
  employeeId: 'p2',
  from: '2026-07',
  missing: 1,
  lines: [
    { id: 'l2', period: '2026-07', componentCode: 'BASIC', kind: 'earning', asPaid: null, corrected: '29000.00', difference: null, base: 'missing' },
    ...READY.lines,
  ],
};
const OVERPAID: Recovery = { id: 'o1', employeeId: 'p2', originTaxYear: '2025-26', crossYear: true, amount: '3000.00', recovered: '1000.00', balance: '2000.00', instalment: '1000.00', reason: 'Paid twice in March', status: 'active' };
const arrears = (o: Partial<LiveArrears> = {}): LiveArrears => ({
  state: 'ready',
  onRetry: vi.fn(),
  worksheets: [READY, MISSING],
  recoveries: [OVERPAID],
  nameOf,
  me: 'u-me',
  can: { approve: true, writeOff: true },
  onApprove: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onConfirmBase: vi.fn(async () => ({})),
  onWriteOff: vi.fn(async () => ({})),
  ...o,
});
const openSheet = async (name: string) => {
  const row = screen.getByRole('row', { name: new RegExp(name) });
  await ue.click(within(row).getByRole('button', { name: 'Open' }));
  return screen.findByRole('dialog', { name: `${name} · arrears` });
};

describe('Arrears and recoveries (PAY-28 live)', () => {
  it('lists worksheets with the design statuses and approves one made by someone else', async () => {
    const live = arrears();
    render(<ArrearsBaseScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Arrears and recoveries' })).toBeInTheDocument();
    expect(screen.getByText('Ready to approve')).toBeInTheDocument();
    expect(screen.getByText('Base needed')).toBeInTheDocument();
    const dlg = await openSheet('Lakshmi Devi');
    expect(within(dlg).getByText('Base confirmed for every month')).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(live.onApprove).toHaveBeenCalledWith(READY));
    expect((await screen.findAllByText(/Arrears for Lakshmi Devi approved/)).length).toBeGreaterThan(0);
  });

  it('never lets the maker approve their own worksheet', async () => {
    render(<ArrearsBaseScreen live={arrears({ me: 'u-other' })} />);
    const dlg = await openSheet('Lakshmi Devi');
    expect(within(dlg).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(dlg).getByText('You made this worksheet, so someone else approves it.')).toBeInTheDocument();
  });

  it('hides Approve and Write off without the permission', async () => {
    render(<ArrearsBaseScreen live={arrears({ can: { approve: false, writeOff: false } })} />);
    const dlg = await openSheet('Lakshmi Devi');
    expect(within(dlg).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('tab', { name: 'Recoveries' }));
    expect(await screen.findByText('Recovering')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write off' })).not.toBeInTheDocument();
  });

  it('confirm base pressed too early shows the field errors and sends nothing; filled in, it sends the lines and the reason', async () => {
    const live = arrears();
    render(<ArrearsBaseScreen live={live} />);
    const dlg = await openSheet('Ravi Kumar');
    expect(within(dlg).getAllByText('Confirm the as-paid base for Jul 2026').length).toBeGreaterThan(0);
    expect(within(dlg).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Confirm base' }));
    expect(await within(dlg).findByText('BASIC: enter what was paid in Jul 2026.')).toBeInTheDocument();
    expect(within(dlg).getByText('Name the document or register (at least 5 characters).')).toBeInTheDocument();
    expect(live.onConfirmBase).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByLabelText(/BASIC as paid in Jul 2026/), '25000');
    await ue.type(within(dlg).getByLabelText(/Where this figure comes from/), 'Old register, page 14');
    await ue.click(within(dlg).getByRole('button', { name: 'Confirm base' }));
    await waitFor(() => expect(live.onConfirmBase).toHaveBeenCalledWith(MISSING, '2026-07', [{ componentCode: 'BASIC', asPaid: '25000' }], 'Old register, page 14'));
  });

  it('discards a worksheet only with a reason (E3 review item 9)', async () => {
    const live = arrears();
    render(<ArrearsBaseScreen live={live} />);
    const dlg = await openSheet('Lakshmi Devi');
    await ue.click(within(dlg).getByRole('button', { name: 'Discard worksheet' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Discard this worksheet?' }).catch(() => screen.findByRole('dialog', { name: 'Discard this worksheet?' }));
    await ue.click(within(ask).getByRole('button', { name: 'Discard worksheet' }));
    expect(await within(ask).findByText('Say why, in 10 characters or more.')).toBeInTheDocument();
    expect(live.onCancel).not.toHaveBeenCalled();
    await ue.type(within(ask).getByLabelText(/Why/), 'Raise was withdrawn');
    await ue.click(within(ask).getByRole('button', { name: 'Discard worksheet' }));
    await waitFor(() => expect(live.onCancel).toHaveBeenCalledWith(READY, 'Raise was withdrawn'));
  });

  it('a write-off needs a reason', async () => {
    const live = arrears();
    render(<ArrearsBaseScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: 'Recoveries' }));
    await ue.click(await screen.findByRole('button', { name: 'Write off' }));
    const ask = await screen.findByRole('dialog', { name: 'Write off what is left?' }).catch(() => screen.findByRole('alertdialog', { name: 'Write off what is left?' }));
    await ue.click(within(ask).getByRole('button', { name: 'Write off' }));
    expect(await within(ask).findByText('Say why (at least 5 characters).')).toBeInTheDocument();
    expect(live.onWriteOff).not.toHaveBeenCalled();
    await ue.type(within(ask).getByLabelText(/Why/), 'Below the cost of recovery');
    await ue.click(within(ask).getByRole('button', { name: 'Write off' }));
    await waitFor(() => expect(live.onWriteOff).toHaveBeenCalledWith(OVERPAID, 'Below the cost of recovery'));
  });

  it('shows the PAY-19 tabs when the page fills the slot', async () => {
    render(<ArrearsBaseScreen live={arrears({ recoveryTabs: <p>Court orders here</p> })} />);
    await ue.click(screen.getByRole('tab', { name: 'Recoveries' }));
    expect(await screen.findByText('Court orders here')).toBeInTheDocument();
    expect(screen.queryByText('Overpayment plans')).not.toBeInTheDocument();
  });

  it('empty, error with retry, and no access', async () => {
    const { unmount } = render(<ArrearsBaseScreen live={arrears({ worksheets: [] })} />);
    expect(screen.getByText('No arrears worksheets')).toBeInTheDocument();
    unmount();
    const live = arrears({ state: 'error', worksheets: null });
    const u2 = render(<ArrearsBaseScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
    u2.unmount();
    render(<ArrearsBaseScreen live={arrears({ state: 'no-access', worksheets: null })} />);
    expect(screen.getByText(/You don't have access to arrears/)).toBeInTheDocument();
  });
});

const VIEW: ActuarialView = {
  censuses: [
    { id: 'c2', asOf: '2026-03-31', standard: 'IND_AS_19', rows: 212, fileId: 'f2', createdAt: '2026-04-02T05:00:00.000Z' },
    { id: 'c1', asOf: '2026-03-31', standard: 'IND_AS_19', rows: 211, fileId: 'f1', createdAt: '2026-04-01T05:00:00.000Z' },
  ],
  valuations: [
    { id: 'g1', valuedOn: '2026-03-31', standard: 'IND_AS_19', kind: 'gratuity', opening: '1000000.00', closing: '1250000.00', delta: '250000.00', journal: [{ account: 'Gratuity expense (actuarial)', debit: '250000.00' }, { account: 'Provision for gratuity', credit: '250000.00' }], status: 'recorded', madeByMe: false },
  ],
};
const actuarial = (o: Partial<LiveActuarial> = {}): LiveActuarial => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KF', keys: [] }],
  entityId: 'e1',
  onEntity: vi.fn(),
  data: VIEW,
  can: { census: true, journal: true },
  onCensus: vi.fn(async () => ({})),
  onDownload: vi.fn(async () => ({})),
  onRecord: vi.fn(async () => ({})),
  onPost: vi.fn(async () => ({})),
  ...o,
});
const toStep = (name: string) => ue.click(screen.getAllByRole('button', { name: new RegExp(name) })[0]);

describe('Actuarial valuation (PAY-38 live)', () => {
  it('lists census versions, downloads one, and asks for the date before making a census', async () => {
    const live = actuarial();
    render(<ActuarialScreen live={live} />);
    expect(screen.getByText('Gratuity and leave liability for Kaveri Foods Pvt Ltd')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Replaced')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download version 2 census as XLSX' }));
    expect(live.onDownload).toHaveBeenCalledWith('f2', 'actuarial-census-2026-03-31.xlsx');
    await ue.click(screen.getByRole('button', { name: 'Make census' }));
    expect(await screen.findByText('Choose the date the census is as at.')).toBeInTheDocument();
    expect(live.onCensus).not.toHaveBeenCalled();
    await ue.type(within(screen.getByRole('region', { name: 'Make a census' })).getByLabelText(/^As at/), '31 Mar 2026');
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Make census' }));
    await waitFor(() => expect(live.onCensus).toHaveBeenCalledWith('2026-03-31', 'IND_AS_19'));
  });

  it("records the actuary's figures only when the date and closing obligation are there", async () => {
    const live = actuarial();
    render(<ActuarialScreen live={live} />);
    await toStep('Valuation');
    await ue.click(await screen.findByRole('button', { name: 'Record figures' }));
    expect(await screen.findByText('Enter the closing obligation from the report.')).toBeInTheDocument();
    expect(screen.getByText('Choose the valuation date.')).toBeInTheDocument();
    expect(live.onRecord).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'Leave encashment' }));
    const form = screen.getByRole('region', { name: "Record the actuary's figures" });
    await ue.type(within(form).getByLabelText(/^As at/), '31 Mar 2026');
    await ue.tab();
    await ue.type(within(form).getByLabelText(/Closing obligation/), '4248000');
    await ue.click(screen.getByRole('button', { name: 'Record figures' }));
    await waitFor(() => expect(live.onRecord).toHaveBeenCalledWith({ asOf: '2026-03-31', standard: 'IND_AS_19', kind: 'leave', closing: '4248000' }, null));
  });

  it('PAY-38 Upload: the movement works out the closing obligation from the last posted one; part of it is refused (negative)', async () => {
    const posted = { ...VIEW.valuations[0], id: 'g0', valuedOn: '2025-03-31', status: 'posted' as const, closing: '1000000.00' };
    const live = actuarial({ data: { ...VIEW, valuations: [posted] } });
    render(<ActuarialScreen live={live} />);
    await toStep('Valuation');
    const form = await screen.findByRole('region', { name: "Record the actuary's figures" });
    await ue.type(within(form).getByLabelText(/^As at/), '31 Mar 2026');
    await ue.tab();
    await ue.type(within(form).getByLabelText('Current service cost'), '218000');
    await ue.click(screen.getByRole('button', { name: 'Record figures' }));
    expect((await screen.findAllByText('Enter all five figures (0 where the report has none), or leave them all empty.')).length).toBeGreaterThan(0);
    expect(live.onRecord).not.toHaveBeenCalled();
    await ue.type(within(form).getByLabelText('Interest cost'), '101200');
    await ue.type(within(form).getByLabelText('Benefits paid (less)'), '84000');
    await ue.type(within(form).getByLabelText('Actuarial loss'), '31800');
    await ue.type(within(form).getByLabelText('Actuarial gain (less)'), '0');
    // 10,00,000 + 2,18,000 + 1,01,200 − 84,000 + 31,800 − 0 = 12,67,000
    expect(within(form).getByText('₹12,67,000')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record figures' }));
    await waitFor(() =>
      expect(live.onRecord).toHaveBeenCalledWith({ asOf: '2026-03-31', standard: 'IND_AS_19', kind: 'gratuity', closing: '1267000', serviceCost: '218000', interestCost: '101200', benefitsPaid: '84000', actuarialLoss: '31800', actuarialGain: '0' }, null),
    );
  });

  it('posts the provision journal after asking', async () => {
    const live = actuarial();
    render(<ActuarialScreen live={live} />);
    await toStep('Provision posting');
    expect(await screen.findByText('Journal: debit expense')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Post provision journal' }));
    const ask = await screen.findByRole('dialog', { name: /Post ₹2,50,000 provision journal/ }).catch(() => screen.findByRole('alertdialog', { name: /Post ₹2,50,000 provision journal/ }));
    await ue.click(within(ask).getByRole('button', { name: 'Post journal' }));
    await waitFor(() => expect(live.onPost).toHaveBeenCalledWith('g1'));
  });

  it('the person who recorded the figures cannot post them; no journal key means no recording', async () => {
    const live = actuarial({ data: { ...VIEW, valuations: VIEW.valuations.map((v) => ({ ...v, madeByMe: true })) } });
    const { unmount } = render(<ActuarialScreen live={live} />);
    await toStep('Provision posting');
    await ue.click(await screen.findByRole('button', { name: 'Post provision journal' }));
    expect((await screen.findAllByText('You recorded these figures, so someone else posts the journal.')).length).toBeGreaterThan(0);
    expect(live.onPost).not.toHaveBeenCalled();
    unmount();
    const noKey = actuarial({ can: { census: false, journal: false } });
    render(<ActuarialScreen live={noKey} />);
    expect(screen.queryByRole('button', { name: 'Make census' })).not.toBeInTheDocument();
    await toStep('Valuation');
    expect(screen.queryByRole('button', { name: 'Record figures' })).not.toBeInTheDocument();
  });

  it('error with retry and no access', async () => {
    const live = actuarial({ state: 'error', data: null });
    const { unmount } = render(<ActuarialScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
    unmount();
    render(<ActuarialScreen live={actuarial({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access to actuarial valuations/)).toBeInTheDocument();
  });
});

describe('E3: rule changes and triggers (PAY-28 live)', () => {
  const changes = (o: Partial<NonNullable<LiveArrears['changes']>> = {}) => ({ proposals: [RULE_OPEN, RULE_READY], jobs: ARREARS_JOBS, canDecide: true, onPreview: vi.fn(async () => ({})), onAccept: vi.fn(async () => ({})), onDismiss: vi.fn(async () => ({})), ...o });
  it('works out the impact, then accepts; what triggers drafted is listed with what was not drafted and why', async () => {
    const c = changes();
    render(<ToastProvider><ArrearsBaseScreen live={arrears({ changes: c, tab: 'changes' })} /></ToastProvider>);
    const open = screen.getByRole('row', { name: /IN\.PT/ });
    expect(within(open).getByText('Not worked out')).toBeInTheDocument();
    // Negative: accepting before the impact is worked out says why and sends nothing.
    await ue.click(within(open).getByRole('button', { name: 'Accept' }));
    expect(screen.getByText(/Work out the impact of IN\.PT 2026-v3 first/)).toBeInTheDocument();
    expect(c.onAccept).not.toHaveBeenCalled();
    await ue.click(within(open).getByRole('button', { name: 'Work out the impact' }));
    await waitFor(() => expect(c.onPreview).toHaveBeenCalledWith(RULE_OPEN));
    const ready = screen.getByRole('row', { name: /IN\.LWF/ });
    expect(within(ready).getByText(/9,120/)).toBeInTheDocument();
    await ue.click(within(ready).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(c.onAccept).toHaveBeenCalledWith(RULE_READY));
    expect((await screen.findAllByText('Accepted. The worksheets are being drafted.')).length).toBeGreaterThan(0);
    expect(screen.getByText('No salary from the joining date yet')).toBeInTheDocument();
    expect(screen.getByText(/Lakshmi Devi/)).toBeInTheDocument();
  });
  it('dismissing needs a reason; without the arrears key there are no buttons', async () => {
    const c = changes();
    const { unmount } = render(<ToastProvider><ArrearsBaseScreen live={arrears({ changes: c, tab: 'changes' })} /></ToastProvider>);
    await ue.click(within(screen.getByRole('row', { name: /IN\.PT/ })).getByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    expect(within(dialog).getByText(/10 characters or more/)).toBeInTheDocument();
    expect(c.onDismiss).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Settled by hand last month');
    await ue.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(c.onDismiss).toHaveBeenCalledWith(RULE_OPEN, 'Settled by hand last month'));
    unmount();
    render(<ArrearsBaseScreen live={arrears({ changes: changes({ canDecide: false }), tab: 'changes' })} />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Work out the impact' })).toBeNull();
  });
});
