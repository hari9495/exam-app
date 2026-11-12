import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BillingWorkbenchScreen, TimesheetCorrectionScreen } from './projects-billing';
import { CostingMarginScreen, type LiveCosts } from './projects';
import type { LiveBilling, LiveCorrection } from './billing-live';
import { LIVE_BILLING, LIVE_BILLING_DRAFTS, LIVE_CORRECTION_FACTS, LIVE_CORRECTION_LINES, LIVE_COSTS } from './projects-live-fixtures';
import { projectSettingsChanges, projectSettingsPage } from '../settings/projects-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';

// Projects P-6 (PRJ-05, PRJ-06; answers 1414 to 1416, 1621, 1622): the workbench on the one invoice engine, the
// account manager's approval as a setting, corrections that make the right document, quarters and the cost journal.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const TODAY = new Date('2026-11-12T00:00:00');
const billing = (over: Partial<LiveBilling> = {}): LiveBilling => ({
  state: 'ready',
  data: LIVE_BILLING,
  months: ['2026-11', '2026-10'],
  onMonth: vi.fn(),
  today: TODAY,
  onDraft: vi.fn(async () => ({ ids: ['i1', 'i2'] })),
  onDelete: vi.fn(async () => {}),
  onApprove: vi.fn(async () => {}),
  onIssue: vi.fn(async () => ({ number: 'KF/TN/192' })),
  onOpenInvoices: vi.fn(),
  onCorrect: vi.fn(),
  ...over,
});
const wb = (live: LiveBilling) => show(<BillingWorkbenchScreen rows={[]} today={TODAY} live={live} />);

describe('PRJ-05 Billing workbench (live)', () => {
  it('finance: unbilled work by client with held items; drafts from the ready items only', async () => {
    const live = billing();
    wb(live);
    expect(screen.getByText(/Held items stay in WIP/)).toBeInTheDocument();
    expect(screen.getByText('Held: waiting for client approval')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Create draft invoices' }));
    expect(live.onDraft).toHaveBeenCalledWith('s1', ['hours:p1:e1', 'hours:p1:e2', 'expense:x1', 'retainer:p3:2026-10']);
    expect((await screen.findAllByText('2 draft invoices created')).length).toBeGreaterThan(0);
  });

  it('negative: no series or nothing chosen says why, and never drafts', async () => {
    const live = billing({ data: { ...LIVE_BILLING, series: [] } });
    wb(live);
    expect(screen.getByText(/Open an invoice series in Settings › Staffing desk/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Create draft invoices' }));
    expect(live.onDraft).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/Open an invoice series first/)).length).toBeGreaterThan(0);
  });

  it('drafts: the GST split, and deleting a draft frees its work', async () => {
    const live = billing({ data: { ...LIVE_BILLING, drafts: LIVE_BILLING_DRAFTS }, defaultStep: 'drafts' });
    wb(live);
    expect(screen.getAllByText(/CGST ₹24,197(\.40)? \+ SGST ₹24,197(\.40)?/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IGST ₹21,600/).length).toBeGreaterThan(0);
    await ue.click(screen.getAllByRole('button', { name: 'Delete draft' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/goes back to unbilled/)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    expect(live.onDelete).toHaveBeenCalledWith(LIVE_BILLING_DRAFTS[0]);
  });

  it('1415 on: only approved drafts are issued; then the issued run, with a way to the one Invoices list', async () => {
    const live = billing({ data: { ...LIVE_BILLING, amApproval: true, drafts: LIVE_BILLING_DRAFTS }, defaultStep: 'approve' });
    wb(live);
    expect(screen.getByText('Waiting for the account manager')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Issue 1 invoice' }));
    expect(live.onIssue).toHaveBeenCalledTimes(1);
    expect(live.onIssue).toHaveBeenCalledWith(LIVE_BILLING_DRAFTS[1]);
    expect((await screen.findAllByText('Deccan Pharma Pvt Ltd · KF/TN/192')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Open invoices' }));
    expect(live.onOpenInvoices).toHaveBeenCalled();
  });

  it('1415: nothing approved yet says so instead of issuing', async () => {
    const live = billing({ data: { ...LIVE_BILLING, amApproval: true, drafts: [LIVE_BILLING_DRAFTS[0]!] }, defaultStep: 'approve' });
    wb(live);
    await ue.click(screen.getByRole('button', { name: 'Issue 0 invoices' }));
    expect(live.onIssue).not.toHaveBeenCalled();
    expect((await screen.findAllByText('The account manager approves the drafts first.')).length).toBeGreaterThan(0);
  });

  it('the account manager approves drafts; with the setting off there is nothing to approve', async () => {
    const live = billing({ data: { ...LIVE_BILLING, approver: true, amApproval: true, wip: [], series: [], drafts: LIVE_BILLING_DRAFTS } });
    const a = wb(live);
    expect(screen.queryByRole('button', { name: 'Create draft invoices' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    expect(live.onApprove).toHaveBeenCalledWith(LIVE_BILLING_DRAFTS[0]);
    a.unmount();
    wb(billing({ data: { ...LIVE_BILLING, approver: true, amApproval: false, wip: [], series: [], drafts: [] } }));
    expect(screen.getByText('Finance issues project invoices alone.')).toBeInTheDocument();
  });

  it('no access and nothing to bill', () => {
    const a = wb(billing({ state: 'no-access', data: null }));
    expect(screen.getByText("You don't have access to project billing")).toBeInTheDocument();
    a.unmount();
    wb(billing({ data: { ...LIVE_BILLING, wip: [] } }));
    expect(screen.getByText('Nothing to bill.')).toBeInTheDocument();
  });
});

const correction = (over: Partial<LiveCorrection> = {}): LiveCorrection => ({
  state: 'ready',
  pick: { projects: [{ id: 'p1', label: 'NRP-WEB · Web store' }], projectId: 'p1', onProject: vi.fn(), months: ['2026-08'], month: '2026-08', onMonth: vi.fn(), lines: LIVE_CORRECTION_LINES, onPick: vi.fn() },
  facts: LIVE_CORRECTION_FACTS,
  onCorrect: vi.fn(async () => ({ adjustment: false, document: { kind: 'credit_note', number: 'KF/TN/CN12' }, recoveryHours: 0 })),
  onBack: vi.fn(),
  ...over,
});

describe('PRJ-06 Correct invoiced time (live)', () => {
  it('fewer invoiced hours make a credit note worked out from the hours', async () => {
    const live = correction({ defaultHours: 36, defaultReason: 'Stand-up booked twice' });
    show(<TimesheetCorrectionScreen live={live} />);
    expect(screen.getByText(/Credit note ₹15,104 linked to KF\/TN\/151/)).toBeInTheDocument(); // 8 h × ₹1,600 + 18% GST
    expect(screen.getByText('No pay recovery (company policy: none).')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Create credit note' }));
    expect(live.onCorrect).toHaveBeenCalledWith(36, 'Stand-up booked twice');
    expect((await screen.findAllByText('Credit note KF/TN/CN12 raised')).length).toBeGreaterThan(0);
    expect(live.onBack).toHaveBeenCalled();
  });

  it('more hours make a supplementary invoice; recovery in hours when the company recovers pay', () => {
    const a = show(<TimesheetCorrectionScreen live={correction({ defaultHours: 48 })} />);
    expect(screen.getByText(/Supplementary invoice ₹7,552 linked to KF\/TN\/151/)).toBeInTheDocument();
    a.unmount();
    show(<TimesheetCorrectionScreen live={correction({ facts: { ...LIVE_CORRECTION_FACTS, recovery: true }, defaultHours: 36 })} />);
    expect(screen.getByText('Pay for 8 h is recovered in the next payroll (company policy).')).toBeInTheDocument();
    expect(screen.queryByText(/₹720/)).toBeNull(); // never a person's cost rate
  });

  it('negative: no reason or the same hours never saves', async () => {
    const live = correction();
    show(<TimesheetCorrectionScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(live.onCorrect).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Enter why the hours change.')).length).toBeGreaterThan(0);
    expect(screen.getByText('Enter the correct hours.')).toBeInTheDocument();
  });

  it('a locked month is an adjustment; time not invoiced makes no document', () => {
    const a = show(<TimesheetCorrectionScreen live={correction({ facts: { ...LIVE_CORRECTION_FACTS, locked: true }, defaultHours: 36 })} />);
    expect(screen.getByText('August 2026 is locked')).toBeInTheDocument();
    a.unmount();
    show(<TimesheetCorrectionScreen live={correction({ facts: { ...LIVE_CORRECTION_FACTS, invoice: null }, defaultHours: 36 })} />);
    expect(screen.queryByText(/Credit note ₹/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('choosing the line', async () => {
    const live = correction({ facts: null });
    show(<TimesheetCorrectionScreen live={live} />);
    expect(screen.getByText('Not invoiced')).toBeInTheDocument();
    await ue.click(screen.getByText('Rohit Bhat'));
    expect(live.pick.onPick).toHaveBeenCalledWith('l1');
  });
});

describe('PRJ-04 quarters and the cost journal (1622)', () => {
  const costs = (over: Partial<LiveCosts> = {}): LiveCosts => ({ state: 'ready', data: LIVE_COSTS, months: ['2026-11', '2026-10', '2026-Q4'], onMonth: vi.fn(), onOpen: vi.fn(), onExport: vi.fn(async () => {}), ...over });

  it('finance exports the month’s journal; a quarter asks for a month; a PM has no export', async () => {
    const live = costs();
    const a = show(<CostingMarginScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Export project cost journal' }));
    expect(live.onExport).toHaveBeenCalledWith(LIVE_COSTS.month);
    a.unmount();
    const q = costs({ data: { ...LIVE_COSTS, month: '2026-Q4' } });
    const b = show(<CostingMarginScreen live={q} />);
    await ue.click(screen.getByRole('button', { name: 'Export project cost journal' }));
    expect(q.onExport).not.toHaveBeenCalled();
    expect((await screen.findAllByText(/Choose a month to export it/)).length).toBeGreaterThan(0);
    b.unmount();
    show(<CostingMarginScreen live={costs({ data: { ...LIVE_COSTS, finance: false } })} />);
    expect(screen.queryByRole('button', { name: 'Export project cost journal' })).toBeNull();
  });
});

describe('Settings 3.11 (1415, 1416)', () => {
  it('the account manager approval (off) and pay recovery (none), with their defaults', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '3.11')!;
    const v = { 'projects.enabled': 'on', 'projects.billing.am_approval': 'off', 'projects.correction.pay_recovery': 'none' };
    const all = projectSettingsPage(design, { canEdit: true, values: v, defaults: v, choices: {}, lastChange: null }).sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'prj.am_approval')).toMatchObject({ value: false, starter: true });
    expect(all.find((x) => x.key === 'prj.pay_recovery')).toMatchObject({ value: 'none', starter: true });
    expect(projectSettingsChanges({ 'prj.am_approval': true, 'prj.pay_recovery': 'next_payroll' })).toEqual([
      { key: 'projects.billing.am_approval', value: 'on' },
      { key: 'projects.correction.pay_recovery', value: 'next_payroll' },
    ]);
  });
});
