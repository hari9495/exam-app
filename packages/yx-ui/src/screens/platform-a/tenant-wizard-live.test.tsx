import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { TenantWizardScreen } from './setup-admin';
import { wizardInput, type LiveTenantWizard } from './tenant-wizard-live';
import { IncidentComposerScreen } from '../portals/console-ops';
import { windowProblem, type LiveMaintenance, type MaintenanceRow } from '../portals/console-maintenance-live';
import { AvailabilityBanner } from '../settings/help';
import { CompanyScreen } from '../console/company';
import { COMPANY, NOW } from '../console/data';

// YukthiX console C-5 (answers 948, 1053): the PLT-09 wizard, YX-10 maintenance and the 6.5 banner, live. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);
const PRODUCTS = [{ code: 'hrms', name: 'YukthiX HR', unit: 'employee', inr: 99 }, { code: 'service_desk', name: 'YukthiX Service Desk', unit: 'agent', inr: 999 }];
const wiz = (o: Partial<LiveTenantWizard> = {}): LiveTenantWizard => ({ products: PRODUCTS, onCreate: vi.fn().mockResolvedValue({ id: 'c9' }), onCancel: vi.fn(), onOpenCompany: vi.fn(), ...o });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const FILLED = { name: 'Tunga Textiles', slug: 'tunga-textiles', leName: 'Tunga Textiles Pvt Ltd', pan: 'AAECT1234F', gstin: '29AAECT1234F1Z5', adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] };

describe('PLT-09 New company (console)', () => {
  it('the input mirrors the API: code, email, PAN, a GSTIN carrying the PAN, a product', () => {
    expect(wizardInput(FILLED).input).toEqual({ name: 'Tunga Textiles', slug: 'tunga-textiles', legalEntity: { name: 'Tunga Textiles Pvt Ltd', pan: 'AAECT1234F', gstin: '29AAECT1234F1Z5' }, adminName: 'Meena Pillai', adminEmail: 'meena@tunga.test', products: ['hrms'] });
    expect(wizardInput({ ...FILLED, slug: 'Bad Code', adminEmail: 'meena', pan: 'AAECT1234', products: [] }).errors.map((e) => e.fieldId)).toEqual(['wz-slug', 'wz-pan', 'wz-admin-email', 'wz-products']);
    expect(wizardInput({ ...FILLED, gstin: '29AAECX9999F1Z5' }).errors).toEqual([{ fieldId: 'wz-gstin', message: 'This GSTIN does not contain the PAN above' }]);
    expect(wizardInput({ ...FILLED, pan: '', gstin: '' }).input?.legalEntity).toEqual({ name: 'Tunga Textiles Pvt Ltd' });
  });

  it('Continue checks the step: errors show and focus moves; the code and registered name follow the company name', async () => {
    const l = wiz();
    wrap(<TenantWizardScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getAllByText('Enter the company name').length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement?.id).toBe('wz-name'));
    await ue.type(screen.getByRole('textbox', { name: /Company name/ }), 'Tunga Textiles');
    expect(screen.getByRole('textbox', { name: /Company code/ })).toHaveValue('tunga-textiles');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('textbox', { name: /Registered name/ })).toHaveValue('Tunga Textiles');
    expect(l.onCreate).not.toHaveBeenCalled();
  });

  it('creates from the review with every step; done shows the invite and the set-up hub next', async () => {
    const l = wiz({ defaultStep: 'products', defaults: FILLED });
    wrap(<TenantWizardScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(await screen.findByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(l.onCreate).toHaveBeenCalledWith(wizardInput(FILLED).input));
    expect(await screen.findByText('Tunga Textiles is ready')).toBeInTheDocument();
    expect(screen.getByText(/meena@tunga.test gets one email: an invite to set their password/)).toBeInTheDocument();
    expect(screen.getAllByText(/Settings › Set-up hub/).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Open the company' }));
    expect(l.onOpenCompany).toHaveBeenCalledWith('c9');
  });

  it('a refusal (a taken company code) shows the reason and keeps everything typed', async () => {
    const l = wiz({ defaultStep: 'products', defaults: FILLED, onCreate: vi.fn().mockRejectedValue(new Error('Organization slug "tunga-textiles" is already taken')) });
    wrap(<TenantWizardScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(await screen.findByRole('button', { name: 'Create company' }));
    expect(await screen.findByText('The company was not created')).toBeInTheDocument();
    expect(screen.getByText(/already taken/)).toBeInTheDocument();
    expect(screen.queryByText('Tunga Textiles is ready')).toBeNull();
  });
});

describe('YX-10 planned maintenance (live)', () => {
  const now = new Date(2026, 10, 12, 10, 0);
  const settings = {
    numbers: [
      { key: 'maintenance.notice_hours', label: 'Notice before a window (hours)', value: 72, default: 72, min: 24, max: 720 },
      { key: 'maintenance.banner_hours', label: 'Show the banner this long before (hours)', value: 24, default: 24, min: 1, max: 168 },
      { key: 'maintenance.max_hours', label: 'Longest window (hours)', value: 4, default: 4, min: 1, max: 12 },
      { key: 'maintenance.block_first_days', label: 'No windows in the first days of the month', value: 7, default: 7, min: 0, max: 10 },
      { key: 'maintenance.block_last_days', label: 'No windows in the last days of the month', value: 3, default: 3, min: 0, max: 10 },
    ],
    blockDates: [7, 15, 20],
  };
  const rows: MaintenanceRow[] = [
    { id: 'w1', title: 'Database upgrade', startsAt: new Date(2026, 10, 18, 1).toISOString(), endsAt: new Date(2026, 10, 18, 3).toISOString(), status: 'pending_approval', writtenBy: 'Joseph', mine: false, decidedBy: null, cancelledBy: null, cancelReason: null, version: 1 },
    { id: 'w2', title: 'My window', startsAt: new Date(2026, 10, 19, 1).toISOString(), endsAt: new Date(2026, 10, 19, 2).toISOString(), status: 'pending_approval', writtenBy: 'Anand', mine: true, decidedBy: null, cancelledBy: null, cancelReason: null, version: 1 },
  ];
  const live = (o: Partial<LiveMaintenance> = {}): LiveMaintenance => ({ state: 'ready', onRetry: vi.fn(), now, windows: rows, settings, current: null, onSchedule: ok(), onApprove: ok(), onCancel: ok(), onSaveSettings: ok(), ...o });
  const screenOf = (l: LiveMaintenance) => wrap(<IncidentComposerScreen incidents={[]} me="" now={now} live={l} />);

  it('the drawn checks, from the settings', () => {
    expect(windowProblem(new Date(2026, 10, 13, 1), 1, settings, now)).toMatch(/hours' notice/);
    expect(windowProblem(new Date(2026, 10, 18, 1), 2, settings, now)).toBeNull();
    expect(windowProblem(new Date(2026, 10, 20, 1), 2, settings, now)).toMatch(/20th is a statutory due date/);
    expect(windowProblem(new Date(2026, 10, 28, 1), 2, settings, now)).toMatch(/payroll-critical/);
    expect(windowProblem(new Date(2026, 10, 18, 1), 2, { ...settings, blockDates: [18] }, now)).toMatch(/18th/);
  });

  it('a window that fails the checks is stopped with the reason; a good one is sent for approval', async () => {
    const bad = live({ defaultStart: new Date(2026, 10, 13, 1) });
    const r = screenOf(bad);
    expect(screen.getByText("This window can't be used")).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Title/ }), 'Database upgrade');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(bad.onSchedule).not.toHaveBeenCalled();
    r.unmount();
    const good = live({ defaultStart: new Date(2026, 10, 18, 1) });
    screenOf(good);
    expect(screen.getByText('Window passes the checks')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Title/ }), 'Database upgrade');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(good.onSchedule).toHaveBeenCalledWith({ title: 'Database upgrade', startsAt: new Date(2026, 10, 18, 1).toISOString(), hours: 2 }));
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
  });

  it('the scheduler cannot approve their own window; another approves; cancelling needs a reason', async () => {
    const l = live();
    screenOf(l);
    const list = screen.getByRole('list', { name: 'Maintenance windows' });
    const mine = within(list).getByText('My window').closest('li')!;
    expect(within(mine).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(mine).getByText('Another staff member approves it')).toBeInTheDocument();
    const theirs = within(list).getByText('Database upgrade').closest('li')!;
    await ue.click(within(theirs).getByRole('button', { name: 'Approve' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onApprove).toHaveBeenCalledWith('w1', 1));
    await ue.click(within(theirs).getByRole('button', { name: 'Cancel window' }));
    const d = await screen.findByRole('dialog', { name: /Cancel “Database upgrade”/ });
    await ue.click(within(d).getByRole('button', { name: 'Cancel window' }));
    expect(within(d).getByText('Say why it is cancelled.')).toBeInTheDocument();
    expect(l.onCancel).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Moved');
    await ue.click(within(d).getByRole('button', { name: 'Cancel window' }));
    await waitFor(() => expect(l.onCancel).toHaveBeenCalledWith('w1', 1, 'Moved'));
  });

  it('rules: statutory dates out of range are stopped; good ones are saved', async () => {
    const l = live();
    screenOf(l);
    const dates = screen.getByRole('textbox', { name: /Statutory due dates/ });
    await ue.clear(dates);
    await ue.type(dates, '7, 31');
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(screen.getByText(/Up to 10 days of the month, each from 1 to 28/)).toBeInTheDocument();
    expect(l.onSaveSettings).not.toHaveBeenCalled();
    await ue.clear(dates);
    await ue.type(dates, '7, 15');
    await ue.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(l.onSaveSettings).toHaveBeenCalledWith({ values: { 'maintenance.notice_hours': 72, 'maintenance.banner_hours': 24, 'maintenance.max_hours': 4, 'maintenance.block_first_days': 7, 'maintenance.block_last_days': 3 }, blockDates: [7, 15] }));
  });
});

describe('6.5 availability banner (answer 948)', () => {
  const w = { title: 'Database upgrade', startsAt: new Date(2026, 10, 18, 1).toISOString(), endsAt: new Date(2026, 10, 18, 3).toISOString() };
  it('before: the date and times, and to save work; during: until when; neither blocks anything', () => {
    const r = render(<AvailabilityBanner kind="maintenance" live={{ ...w, phase: 'upcoming' }} />);
    expect(screen.getByText(/Database upgrade: planned maintenance on 18 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Save your work before/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    r.unmount();
    render(<AvailabilityBanner kind="maintenance" live={{ ...w, phase: 'now' }} />);
    expect(screen.getByText(/Database upgrade: planned maintenance until/)).toBeInTheDocument();
    expect(screen.getByText(/your saved work is safe/)).toBeInTheDocument();
  });
});

describe('the company page: products and features (answer 1053)', () => {
  const base = { state: 'ready' as const, company: COMPANY, sessions: [], canManage: true, canSupport: true, now: NOW, onBack: vi.fn(), onLifecycle: ok(), onExtendTrial: ok(), onRequestSupport: ok(), onOpenSession: ok(), onEndSession: ok(), onWithdrawRequest: ok() };
  it('lists each product and feature with On, or why it is off; none without the data', () => {
    const r = wrap(<CompanyScreen {...base} features={[{ key: 'p1', label: 'YukthiX HR', on: true, source: 'product' }, { key: 'p2', label: 'YukthiX Service Desk', on: false, source: 'product', note: 'Not in the plan' }]} />);
    const list = screen.getByRole('list', { name: 'Products and features' });
    expect(within(within(list).getByText('YukthiX HR').closest('li')!).getByText('On')).toBeInTheDocument();
    expect(within(within(list).getByText('YukthiX Service Desk').closest('li')!).getByText('Not in the plan')).toBeInTheDocument();
    r.unmount();
    wrap(<CompanyScreen {...base} />);
    expect(screen.queryByRole('list', { name: 'Products and features' })).toBeNull();
  });
});
