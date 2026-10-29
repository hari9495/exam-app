import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LeaveHomeScreen } from './leave';
import { LeavePoliciesScreen, LeaveTypeEditorScreen, type LiveBlockDates } from './leave-admin';
import { LeaveReportsScreen } from './ops';
import { TIME_SETUP } from './live/fixtures';
import type { BlockDates, HrLeaveHome, LeaveReport, LongAbsenceCheck } from './live/types';

// Founder decisions 1, 2 and 3 (29 Oct 2026) on the live screens: Record long absence (TIM-17 HR), company block dates
// (TIM-28), notice per leave type (TIM-27) and the leave liability (TIM-30). Pressed too early shows field errors and
// focuses the field (never a disabled button); a problem from the server stops Record; money only when the API sends it.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const HR: HrLeaveHome = { today: '2026-10-29', pending: { total: 0, rows: [] }, away: [], negative: 0, certificates: [], yearEnd: { on: '2025-12-31', posted: true, nextOn: '2026-12-31' } };
const hrefs = { approvals: '/a', calendar: '/c', negative: '/n', yearEnd: '/y', request: () => '/a' };
const OK: LongAbsenceCheck = { name: 'Arjun Kulkarni', accrues: false, comesBackOn: '2027-05-01', leave: [], problems: [] };

describe('Record long absence (TIM-17 HR, live)', () => {
  const open = (record: Parameters<typeof LeaveHomeScreen>[0]['hrLive'] extends infer L ? L extends { record?: infer R } ? R : never : never) =>
    wrap(<LeaveHomeScreen hrLive={{ state: 'ready', data: HR, onRemind: vi.fn(), onNavigate: vi.fn(), hrefs, record }} />);

  it('Record too early shows each missing field and focuses the person', async () => {
    const onRecord = vi.fn();
    open({ onFindPeople: vi.fn(async () => []), onCheck: vi.fn(async () => OK), onRecord });
    await ue.click(screen.getByRole('button', { name: 'Record long absence' }));
    const dlg = screen.getByRole('dialog', { name: 'Record long absence' });
    await ue.click(within(dlg).getByRole('button', { name: 'Record absence' }));
    expect(within(dlg).getByText('Choose the person.')).toBeInTheDocument();
    expect(within(dlg).getByText('Choose the first day away.')).toBeInTheDocument();
    expect(within(dlg).getByText('Write the reason in at least 10 characters.')).toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();
    expect(within(dlg).getByRole('button', { name: 'Record absence' })).toBeEnabled();
  });

  it('shows the effect on pay and leave, then records; leave in the way stops Record and says why', async () => {
    const onRecord = vi.fn(async () => ({}));
    const onCheck = vi.fn(async () => OK);
    open({ onFindPeople: vi.fn(async () => [{ id: 'e1', label: 'Arjun Kulkarni', detail: 'KF-1' }]), onCheck, onRecord });
    await ue.click(screen.getByRole('button', { name: 'Record long absence' }));
    const dlg = screen.getByRole('dialog', { name: 'Record long absence' });
    await ue.click(within(dlg).getByRole('radio', { name: 'Long leave without pay' }));
    await ue.type(within(dlg).getByLabelText('Search person'), 'Arj');
    await ue.click(await within(dlg).findByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: /Arjun Kulkarni/ }));
    await ue.type(within(dlg).getByLabelText(/First day away/), '2 Nov 2026{Enter}');
    await ue.type(within(dlg).getByLabelText(/Last day away/), '30 Apr 2027{Enter}');
    await ue.type(within(dlg).getByLabelText(/Reason/), 'Care for a parent after surgery');
    await waitFor(() => expect(onCheck).toHaveBeenCalledWith({ employeeId: 'e1', from: '2026-11-02', to: '2027-04-30' }));
    expect(await within(dlg).findByText('No leave earned for these days (company setting)')).toBeInTheDocument();
    expect(within(dlg).getByText('Not paid: the days go to payroll as unpaid days')).toBeInTheDocument();
    expect(within(dlg).getByText('1 May 2027')).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Record absence' }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledWith({ employeeId: 'e1', kind: 'lwp', from: '2026-11-02', to: '2027-04-30', note: 'Care for a parent after surgery' }));

    onRecord.mockClear();
    onCheck.mockResolvedValue({ ...OK, problems: ['Arjun Kulkarni already has leave on these dates: Earned leave 3 Nov 2026 – 5 Nov 2026 (approved). Withdraw or cancel it first, then record the absence.'] });
    await ue.click(screen.getByRole('button', { name: 'Record long absence' }));
    const again = screen.getByRole('dialog', { name: 'Record long absence' });
    await ue.click(await within(again).findByRole('combobox', { name: 'Person' }));
    await ue.click(await screen.findByRole('option', { name: /Arjun Kulkarni/ }));
    await ue.type(within(again).getByLabelText(/First day away/), '2 Nov 2026{Enter}');
    await ue.type(within(again).getByLabelText(/Last day away/), '30 Apr 2027{Enter}');
    await ue.type(within(again).getByLabelText(/Reason/), 'Care for a parent after surgery');
    expect(await within(again).findByText(/already has leave on these dates/)).toBeInTheDocument();
    await ue.click(within(again).getByRole('button', { name: 'Record absence' }));
    expect(onRecord).not.toHaveBeenCalled();
  });
});

describe('Company block dates (TIM-28, live)', () => {
  const openBlocks = async (ui: ReactElement) => {
    wrap(ui);
    await ue.click(screen.getByRole('tab', { name: 'Company block dates' }));
  };
  const BLOCKS: BlockDates = {
    mode: 'block',
    types: [
      { id: 'el', name: 'Earned leave', kind: 'earned', stoppedByDefault: true, canStop: true },
      { id: 'sl', name: 'Sick leave', kind: 'sick', stoppedByDefault: false, canStop: true },
      { id: 'ml', name: 'Maternity leave', kind: 'maternity', stoppedByDefault: false, canStop: false },
    ],
    entities: [{ id: 'ent', name: 'Kaveri Foods' }],
    locations: [{ id: 'loc', name: 'Chennai office' }],
    dates: [{ id: 'b1', from: '2026-11-25', to: '2026-11-26', reason: 'Stock count', scopeType: 'location', scopeId: 'loc', scopeName: 'Chennai office', leaveTypeIds: [], affected: [{ id: 'r1', name: 'Arjun Kulkarni', type: 'Earned leave', from: '2026-11-25', to: '2026-11-25', status: 'approved' }] }],
  };
  const policies = (blockDates: LiveBlockDates) => ({ state: 'ready' as const, data: TIME_SETUP, onCreatePolicy: vi.fn(), onAddVersion: vi.fn(), onAssign: vi.fn(), onRemoveAssignment: vi.fn(), onOpenType: vi.fn(), blockDates });

  it('lists the dates, where, which leave and who already has leave then (their leave stays); Remove asks first', async () => {
    const onRemove = vi.fn(async () => ({}));
    await openBlocks(<LeavePoliciesScreen live={policies({ state: 'ready', data: BLOCKS, onAdd: vi.fn(), onRemove })} />);
    expect(screen.getByText('25 Nov 2026 – 26 Nov 2026 · Stock count')).toBeInTheDocument();
    expect(screen.getByText(/Chennai office · Planned leave \(not sick, maternity, paternity or unpaid leave\)/)).toBeInTheDocument();
    expect(screen.getByText(/Already on leave then \(their leave stays\): Arjun Kulkarni · Earned leave 25 Nov 2026 \(approved\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    await ue.click(within(screen.getByRole('dialog', { name: 'Remove these block dates?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('b1'));
  });

  it('Add too early shows field errors; sick leave is unticked and maternity is not offered; a location must be chosen', async () => {
    const onAdd = vi.fn(async () => ({}));
    await openBlocks(<LeavePoliciesScreen live={policies({ state: 'ready', data: { ...BLOCKS, dates: [] }, onAdd, onRemove: vi.fn() })} />);
    expect(screen.getByText('No block dates')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Add block dates' })[0]!);
    const dlg = screen.getByRole('dialog', { name: 'Add block dates' });
    expect(within(dlg).getByRole('checkbox', { name: 'Earned leave' })).toBeChecked();
    expect(within(dlg).getByRole('checkbox', { name: 'Sick leave' })).not.toBeChecked();
    expect(within(dlg).queryByRole('checkbox', { name: 'Maternity leave' })).toBeNull();
    await ue.click(within(dlg).getByRole('button', { name: 'Add block dates' }));
    expect(within(dlg).getByText('Choose the first date.')).toBeInTheDocument();
    expect(within(dlg).getByText('Enter a reason people will see.')).toBeInTheDocument();
    await ue.type(within(dlg).getByLabelText(/^From/), '25 Nov 2026{Enter}');
    await ue.type(within(dlg).getByLabelText(/^To/), '26 Nov 2026{Enter}');
    await ue.type(within(dlg).getByLabelText(/Reason/), 'Stock count');
    await ue.click(within(dlg).getByRole('radio', { name: 'A location' }));
    await ue.click(within(dlg).getByRole('button', { name: 'Add block dates' }));
    expect(within(dlg).getByText('Choose the location.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.click(within(dlg).getByRole('radio', { name: 'Whole company' }));
    await ue.click(within(dlg).getByRole('checkbox', { name: 'Sick leave' }));
    await ue.click(within(dlg).getByRole('button', { name: 'Add block dates' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ from: '2026-11-25', to: '2026-11-26', reason: 'Stock count', scopeType: 'tenant', leaveTypeIds: ['el', 'sl'] }));
  });

  it('the default leave types are sent as none picked (planned leave only)', async () => {
    const onAdd = vi.fn(async () => ({}));
    await openBlocks(<LeavePoliciesScreen live={policies({ state: 'ready', data: BLOCKS, onAdd, onRemove: vi.fn() })} />);
    await ue.click(screen.getByRole('button', { name: 'Add block dates' }));
    const dlg = screen.getByRole('dialog', { name: 'Add block dates' });
    await ue.type(within(dlg).getByLabelText(/^From/), '1 Dec 2026{Enter}');
    await ue.type(within(dlg).getByLabelText(/^To/), '1 Dec 2026{Enter}');
    await ue.type(within(dlg).getByLabelText(/Reason/), 'Audit');
    await ue.click(within(dlg).getByRole('button', { name: 'Add block dates' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ from: '2026-12-01', to: '2026-12-01', reason: 'Audit', scopeType: 'tenant' }));
  });

  it('loading and could not load', async () => {
    const onRetry = vi.fn();
    await openBlocks(<LeavePoliciesScreen live={policies({ state: 'error', data: null, onRetry, onAdd: vi.fn(), onRemove: vi.fn() })} />);
    expect(screen.getByText("The block dates didn't load")).toBeInTheDocument();
  });
});

describe('Notice per leave type (TIM-27, live)', () => {
  it('blank means the company default, named in the helper; a number of its own replaces it', async () => {
    const onSaveType = vi.fn(async () => ({}));
    const el = TIME_SETUP.types.find((t) => t.kind === 'earned')!;
    const data = { ...TIME_SETUP, noticeDefault: 3, types: TIME_SETUP.types.map((t) => (t.id === el.id ? { ...t, rules: { ...t.rules, noticeDays: null } } : t)) };
    wrap(<LeaveTypeEditorScreen live={{ state: 'ready', data, typeId: el.id, onSaveType, policiesHref: '/p' }} />);
    await ue.click(screen.getByRole('tab', { name: 'Rules' }));
    expect(screen.getByText('Blank: the company default, 3 days.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/Apply at least/), '7');
    expect(screen.getByText('Leave blank to use the company default.')).toBeInTheDocument();
  });
});

describe('Leave liability (TIM-30, live)', () => {
  const base: LeaveReport = { report: 'liability', types: [{ id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', hasBalance: true, paid: true }], total: 2, page: 1, pageSize: 50, filters: { entities: [], locations: [], departments: [] }, totalDays: 22, rows: [] };
  const live = (data: LeaveReport) => ({ state: 'ready' as const, data, query: { report: 'liability' as const, page: 1, pageSize: 50 }, onQuery: vi.fn(), onExport: vi.fn(async () => undefined), onOpenCard: vi.fn() });

  it('a pay viewer sees daily pay, the liability, "No pay set" (never 0) and the rule that made it', () => {
    wrap(<LeaveReportsScreen live={live({ ...base, money: true, dailyPayRule: { basis: 'basic_da', divisor: '26' }, rows: [{ employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-1', values: { el: 12 }, days: 12, dailyPay: 1000, amount: 12000, noPay: false }, { employeeId: 'e2', name: 'Priya Shankar', code: 'KF-2', values: { el: 10 }, days: 10, dailyPay: null, amount: null, noPay: true }] })} />);
    expect(screen.getByText('Basic + DA ÷ 26 (company setting)')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Leave liability' });
    expect(within(table).getAllByText('₹12,000').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('No pay set')).toHaveLength(2);
  });

  it('someone without pay access sees days only, and is told why', () => {
    wrap(<LeaveReportsScreen live={live({ ...base, money: false, rows: [{ employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-1', values: { el: 12 }, days: 12 }] })} />);
    expect(screen.getByText(/22 unused days that can be cashed in\. The money shows only to people who may see pay/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Leave liability' });
    expect(within(table).queryByText('Liability')).toBeNull();
    expect(within(table).queryByText('Daily pay')).toBeNull();
  });
  it('Payroll with the liability key only: one report in the picker, no leave cards, Export still there (founder answer A)', async () => {
    const { onOpenCard: _no, ...l } = live({ ...base, money: true, dailyPayRule: { basis: 'basic_da', divisor: '26' }, rows: [{ employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-1', values: { el: 12 }, days: 12, dailyPay: 1000, amount: 12000, noPay: false }] });
    wrap(<LeaveReportsScreen live={{ ...l, reports: ['liability'] }} />);
    await ue.click(screen.getByRole('combobox', { name: 'Report' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Leave liability']);
    await ue.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Open leave card' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });
});
