import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ClientsScreen, ClientWorkspaceScreen, RateCardScreen, type ClientView, type LiveRateCard } from './hiring-staffing';
import { ClientSheet, InvoiceSeriesSheet } from './staffing-sheets';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { staffingSettingsChanges, staffingSettingsPage, type StaffingSettingsData } from '../settings/staffing-live';

// Staffing desk slice 1 (HIR-14, HIR-15, Settings 6.2): the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('HIR-14 clients (live)', () => {
  const rows = [{ id: 'c1', name: 'Nilgiri Retail', gstin: '33AAFCN4521K1Z2', stateName: 'Tamil Nadu', status: 'active' as const, accountManager: 'Anita Kurian', contractEnd: '2027-03-31', contacts: 2 }];
  it('lists the company’s clients and opens one; Add client only for account managers', async () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    const { unmount } = wrap(<ClientsScreen live={{ state: 'ready', onRetry: vi.fn(), rows, canManage: true, onAdd, onOpen }} />);
    expect(screen.getByText('Tamil Nadu · GSTIN 33AAFCN4521K1Z2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open Nilgiri Retail' }));
    expect(onOpen).toHaveBeenCalledWith('c1');
    await ue.click(screen.getByRole('button', { name: 'Add client' }));
    expect(onAdd).toHaveBeenCalled();
    unmount();
    wrap(<ClientsScreen live={{ state: 'ready', onRetry: vi.fn(), rows, canManage: false, onAdd, onOpen }} />);
    expect(screen.queryByRole('button', { name: 'Add client' })).not.toBeInTheDocument();
  });
  it('the desk off, no key, error and empty states', () => {
    const base = { onRetry: vi.fn(), rows: [], canManage: true, onAdd: vi.fn(), onOpen: vi.fn() };
    const { unmount } = wrap(<ClientsScreen live={{ ...base, state: 'off' }} />);
    expect(screen.getByText('The staffing desk is off.')).toBeInTheDocument();
    unmount();
    const r2 = wrap(<ClientsScreen live={{ ...base, state: 'error' }} />);
    expect(screen.getByText('Clients could not be loaded.')).toBeInTheDocument();
    r2.unmount();
    wrap(<ClientsScreen live={{ ...base, state: 'ready' }} />);
    expect(screen.getByText('No clients yet.')).toBeInTheDocument();
  });
});

describe('HIR-14 client workspace (live)', () => {
  const client: ClientView = { id: 'c1', name: 'Nilgiri Retail', legalName: null, gstin: null, stateName: 'Tamil Nadu', billingAddress: '14 Anna Salai', status: 'on_hold', accountManager: '', paymentTermsDays: null, defaultPaymentTermsDays: 30, contractStart: null, contractEnd: null, noticeDays: null, slaFirstSubmissionDays: 3, slaFeedbackDays: null };
  const contacts = [{ id: 'k1', name: 'Meera Pillai', role: 'Accounts payable', email: 'meera@x.test', phone: null, billing: true }];
  it('shows real facts only; contacts can be changed and removed after a confirmation', async () => {
    const live = { client, contacts, canManage: true, onEdit: vi.fn(), onRates: vi.fn(), onAddContact: vi.fn(), onEditContact: vi.fn(), onRemoveContact: vi.fn().mockResolvedValue({}) };
    wrap(<ClientWorkspaceScreen live={live} defaultTab="contacts" />);
    expect(screen.getByText('No GSTIN · Tamil Nadu')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.queryByText(/Receivable|Portal:|Invite to portal|New client job/)).not.toBeInTheDocument();
    expect(screen.getByText('Billing contact')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Remove Meera Pillai' }));
    await ue.click(screen.getAllByRole('button', { name: 'Remove contact' }).at(-1)!);
    await waitFor(() => expect(live.onRemoveContact).toHaveBeenCalledWith('k1'));
    await ue.click(screen.getByRole('button', { name: 'Rate card' }));
    expect(live.onRates).toHaveBeenCalled();
  });
  it('a recruiter reads only: no change buttons', () => {
    wrap(<ClientWorkspaceScreen live={{ client, contacts, canManage: false, onEdit: vi.fn(), onRates: vi.fn(), onAddContact: vi.fn(), onEditContact: vi.fn(), onRemoveContact: vi.fn() }} defaultTab="contacts" />);
    expect(screen.queryByRole('button', { name: /^(Change |Remove |Add contact)/ })).not.toBeInTheDocument();
  });
});

describe('HIR-15 rate card (live)', () => {
  const rows = [{ id: 'r1', role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour' as const, billRate: '1200.00', payRate: '800.00', marginPct: '33.3', ot: '1.5', holiday: '2', validFrom: '2026-04-01', validTo: null }];
  const live = (over: Partial<LiveRateCard> = {}): LiveRateCard => ({ state: 'ready', onRetry: vi.fn(), clientName: 'Nilgiri Retail', rows, showPay: true, canManage: true, history: false, onHistory: vi.fn(), today: new Date(2026, 10, 14), onAdd: vi.fn(), onChange: vi.fn().mockResolvedValue({}), ...over });
  it('account manager: margins; a dated change is checked before it is sent', async () => {
    const l = live();
    wrap(<RateCardScreen live={l} />);
    expect(screen.getByText('33.3%')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change rate' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Save dated change' }));
    expect(within(sheet).getByText('Say why the rate changes.')).toBeInTheDocument();
    expect(l.onChange).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByLabelText(/^Reason/), 'Annual revision');
    await ue.click(within(sheet).getByRole('button', { name: 'Save dated change' }));
    await waitFor(() => expect(l.onChange).toHaveBeenCalledWith('r1', { validFrom: '2026-11-14', billRate: 1200, payRate: 800, reason: 'Annual revision' }));
  });
  it('recruiter: no pay rates, margins or change buttons', () => {
    wrap(<RateCardScreen live={live({ showPay: false, canManage: false, rows: [{ ...rows[0]!, payRate: undefined, marginPct: undefined }] })} />);
    expect(screen.queryByText('Pay rate')).not.toBeInTheDocument();
    expect(screen.queryByText('33.3%')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change rate|Add role/ })).not.toBeInTheDocument();
    expect(screen.getByText('Pay rates and margins are visible to account managers.')).toBeInTheDocument();
  });
});

describe('sheets', () => {
  it('client: pressed too early shows each error; a malformed GSTIN is caught before sending', async () => {
    const onSave = vi.fn();
    wrap(<ClientSheet open onOpenChange={vi.fn()} initial={null} states={[{ value: 'IN-TN', label: 'Tamil Nadu' }]} people={[]} defaultTermsDays={30} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add client' }));
    expect(screen.getByText('Enter the client’s name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the billing state.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^GSTIN/), 'ABC');
    await ue.click(screen.getByRole('button', { name: 'Add client' }));
    expect(screen.getByText(/A GSTIN has 15 characters/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
  it('invoice series: the next number cannot go down; a refusal stays in the sheet', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('A GST invoice number has at most 16 characters: shorten the prefix.'));
    wrap(<InvoiceSeriesSheet open onOpenChange={vi.fn()} initial={{ id: 's1', legalEntityId: 'e1', gstin: '29AABCK1234F1Z5', financialYear: '2026-27', prefix: 'KFL/INV/', nextNumber: 87 }} entities={[{ id: 'e1', name: 'Kaveri', gstins: ['29AABCK1234F1Z5'] }]} financialYear="2026-27" onSave={onSave} />);
    const n = screen.getByLabelText(/^Next number/);
    await ue.clear(n);
    await ue.type(n, '80');
    await ue.click(screen.getByRole('button', { name: 'Save series' }));
    expect(screen.getByText('It cannot go below 87.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(n);
    await ue.type(n, '90');
    await ue.click(screen.getByRole('button', { name: 'Save series' }));
    expect(await screen.findByText(/at most 16 characters/)).toBeInTheDocument();
  });
});

describe('Settings 6.2 Staffing desk (live)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.2')!;
  const DATA: StaffingSettingsData = {
    canEdit: true,
    values: { 'staffing.desk.enabled': 'off', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0' },
    defaults: { 'staffing.desk.enabled': 'off', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0' },
    choices: { 'staffing.ot_multiplier': ['1', '1.5', '2'], 'staffing.holiday_multiplier': ['1', '2'], 'staffing.payment_terms_days': ['15', '30'], 'staffing.rate_change.backdate_days': ['0', '30'] },
    lastChange: null,
    financialYear: '2026-27',
    entities: [],
    series: [{ id: 's1', legalEntityId: 'e1', entity: 'Kaveri Staffing', gstin: '29AABCK1234F1Z5', financialYear: '2026-27', prefix: 'KS/INV/', nextNumber: 87, version: 1 }],
  };
  it('shows only what is built (no sample series, bench or portal), and turning the desk on saves as a company setting', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" live={{ page: staffingSettingsPage(design, DATA), canEdit: true, lastChange: null, onSave }} />);
    expect(screen.getByText('Kaveri Staffing')).toBeInTheDocument();
    for (const t of ['33AABCK1234F1Z9', 'Bench pay', 'Maximum bench days', 'Client portal response times', 'Payment reminders', 'E-invoicing (IRN and QR)']) expect(screen.queryByText(t)).not.toBeInTheDocument();
    expect(screen.queryByText(/Coming soon/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: /Turn on the staffing desk/ }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(staffingSettingsChanges(onSave.mock.calls[0]![0])).toEqual([{ key: 'staffing.desk.enabled', value: 'on' }]);
  });
  it('maps every field back to its company setting', () => {
    expect(staffingSettingsChanges({ 'staff.ot_multiplier': '2', 'staff.rate_backdate': '30', 'staff.payment_terms': '15', 'staff.desk_enabled': false, other: 'x' })).toEqual([
      { key: 'staffing.ot_multiplier', value: '2' },
      { key: 'staffing.rate_change.backdate_days', value: '30' },
      { key: 'staffing.payment_terms_days', value: '15' },
      { key: 'staffing.desk.enabled', value: 'off' },
    ]);
  });
});
