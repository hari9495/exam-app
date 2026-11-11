import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { InvoiceRecordScreen, PlacementFee, VendorInvoices, type InvoiceDetail, type LivePlacementFee } from './hiring-staffing';
import { ClientPortalScreen, type LiveClientPortal } from '../portals/t9-business';
import { ExportSheet } from './staffing-sheets';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { staffingSettingsChanges, staffingSettingsPage, type StaffingSettingsData } from '../settings/staffing-live';

// Staffing round 4 (answers 491, 492, 494, 496): live views, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('492: the invoice PDF', () => {
  const data = (status: 'draft' | 'issued', canEdit = false): InvoiceDetail => ({
    canEdit,
    invoice: { id: 'i1', number: status === 'draft' ? null : 'KS/1', kind: 'staffing', creditOf: null, client: 'Nilgiri', clientState: 'Tamil Nadu', supplierState: 'Karnataka', interState: true, gstPct: '18', date: status === 'draft' ? null : '2026-11-01', dueOn: null, period: null, po: null, reason: null, taxable: '100.00', cgst: '0.00', sgst: '0.00', igst: '18.00', total: '118.00', paid: '0.00', outstanding: '118.00', status, irn: 'not_needed', version: 1, window: null },
    lines: [],
    creditNotes: [],
    rule: { reportWithinDays: 30, warnFromDay: 25 },
  });
  const live = (status: 'draft' | 'issued', onPdf = vi.fn()) => ({ state: 'ready' as const, onRetry: vi.fn(), data: data(status), onIssue: vi.fn(), onDelete: vi.fn(), onCreditNote: vi.fn(), onReissue: vi.fn(), onOpen: vi.fn(), onPdf });
  it('a reader downloads the PDF of an issued invoice; a draft has none', async () => {
    const onPdf = vi.fn();
    const { unmount } = wrap(<InvoiceRecordScreen live={live('issued', onPdf)} />);
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(onPdf).toHaveBeenCalled();
    unmount();
    wrap(<InvoiceRecordScreen live={live('draft')} />);
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });
});

describe('494: the placement fee', () => {
  const base: LivePlacementFee = { hiredOn: null, ctc: null, feeInvoice: null, leftOn: null, guarantee: null, series: [{ value: 's1', label: 'KS/' }], terms: true, today: new Date(2026, 10, 10), onHired: vi.fn().mockResolvedValue(undefined), onLeft: vi.fn().mockResolvedValue(undefined), onOpenInvoice: vi.fn() };
  it('recording a hire needs the CTC; then it is sent with the date and series', async () => {
    const f = { ...base, onHired: vi.fn().mockResolvedValue(undefined) };
    wrap(<PlacementFee canManage person="Arun" fee={f} />);
    await ue.click(screen.getByRole('button', { name: 'Client hired Arun' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Record the hire' }));
    expect(within(dialog).getByText('Enter the CTC.')).toBeInTheDocument();
    expect(f.onHired).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByLabelText(/First-year CTC/), '1800000');
    await ue.click(within(dialog).getByRole('button', { name: 'Record the hire' }));
    await waitFor(() => expect(f.onHired).toHaveBeenCalledWith({ hiredOn: '2026-11-10', ctc: 1800000, seriesId: 's1', endPlacement: true }));
  });
  it('528: ending the placement is on by default and can be turned off', async () => {
    const f = { ...base, onHired: vi.fn().mockResolvedValue(undefined) };
    wrap(<PlacementFee canManage person="Arun" fee={f} />);
    await ue.click(screen.getByRole('button', { name: 'Client hired Arun' }));
    const dialog = await screen.findByRole('dialog');
    const box = within(dialog).getByRole('checkbox', { name: /End the placement on the day before the hire/ });
    expect(box).toBeChecked();
    await ue.click(box);
    await ue.type(within(dialog).getByLabelText(/First-year CTC/), '1800000');
    await ue.click(within(dialog).getByRole('button', { name: 'Record the hire' }));
    await waitFor(() => expect(f.onHired).toHaveBeenCalledWith(expect.objectContaining({ endPlacement: false })));
  });
  it('after the hire: the fee invoice and Left the client; nothing for a reader', () => {
    const hired = { ...base, hiredOn: '2026-10-01', ctc: '1800000.00', feeInvoice: { id: 'f1', number: 'KS/7', status: 'issued', total: '176929.20' } };
    const { unmount } = wrap(<PlacementFee canManage person="Arun" fee={hired} />);
    expect(screen.getByRole('button', { name: /KS\/7/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left the client' })).toBeInTheDocument();
    unmount();
    wrap(<PlacementFee canManage={false} person="Arun" fee={hired} />);
    expect(screen.queryByRole('button', { name: 'Left the client' })).not.toBeInTheDocument();
  });
});

describe('496: vendor invoices into payroll', () => {
  it('a confirmed invoice shows its payroll state and cannot be marked paid on the desk; confirm sends the vendor date', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    wrap(
      <VendorInvoices
        live={{
          canEdit: true,
          onConfirm,
          onPaid: vi.fn(),
          rows: [
            { id: null, status: 'waiting', vendorInvoiceNo: null, vendor: 'Velocity', worker: 'Priya', placementId: 'p1', month: '2026-10', hours: '40', rate: '900.00', net: '36000.00', gst: '6480.00', tdsSection: '194C', tds: '720.00' },
            { id: 'b1', status: 'confirmed', vendorInvoiceNo: 'VT/1', vendor: 'Velocity', worker: 'Priya', placementId: 'p1', month: '2026-09', hours: '40', rate: '900.00', net: '36000.00', gst: '6480.00', tdsSection: '194C', tds: '720.00', payroll: { status: 'submitted', paidOn: null, tds: null } },
          ],
        }}
      />,
    );
    expect(screen.getByText('In payroll: submitted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Vendor confirmed' }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/invoice number/), 'VT/2');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('p1', '2026-10', 'VT/2', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
  });
});

describe('491: client portal interviews', () => {
  const live = (over: Partial<LiveClientPortal> = {}): LiveClientPortal => ({
    tenant: 'Kaveri',
    tab: 'interviews',
    hrefFor: (t) => `?tab=${t}`,
    state: 'ready',
    onRetry: vi.fn(),
    ended: false,
    onSignInAgain: vi.fn(),
    onSignOut: vi.fn(),
    today: new Date(2026, 10, 10),
    data: { client: { name: 'Nilgiri', contact: 'Ravi', email: 'ravi@nilgiri.test', contractEnds: null }, jobs: [], submissions: [], timesheets: [], invoices: [], interviews: [{ id: 'iv1', candidate: 'Deepa', job: 'Java', at: '2026-11-13T05:30:00.000Z', mode: 'Video call', panel: 'Divya', status: 'Proposed' }], bookable: [{ value: 's1', label: 'Deepa · Java' }] },
    onDecide: vi.fn(),
    onTimesheet: vi.fn(),
    onBook: vi.fn().mockResolvedValue(undefined),
    ...over,
  });
  it('lists interviews; proposing needs a candidate and a date', async () => {
    const l = live();
    wrap(<ClientPortalScreen live={l} />);
    expect(screen.getByText('Deepa · Java')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Schedule interview' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Propose time' }));
    expect(within(dialog).getByText('Choose the candidate.')).toBeInTheDocument();
    expect(l.onBook).not.toHaveBeenCalled();
  });
  it('no one to book: no Schedule button', () => {
    wrap(<ClientPortalScreen live={live({ data: { ...live().data!, bookable: [] } })} />);
    expect(screen.queryByRole('button', { name: 'Schedule interview' })).not.toBeInTheDocument();
  });
});

describe('522: the export sheet', () => {
  it('needs a series and month; names the drafts left out; sends the chosen format', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    wrap(<ExportSheet open onOpenChange={vi.fn()} options={{ series: [{ id: 's1', label: 'KS/', months: ['2026-10'], drafts: 2 }, { id: 's2', label: 'KT/', months: [], drafts: 0 }] }} onExport={onExport} />);
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByText('Choose the series.')).toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Invoice series/ }));
    await ue.click(await screen.findByRole('option', { name: 'KS/' }));
    expect(screen.getByText(/2 drafts are not exported/)).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Zoho Books (CSV)' }));
    await ue.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ seriesId: 's1', month: '2026-10', format: 'zoho' }));
  });
});

describe('491: client portal tickets', () => {
  const view = { id: 't1', number: 'CS-7', subject: 'Replace the night operator', category: 'Replacement', priority: 'Normal', status: 'Open', raisedOn: '2026-11-10T04:00:00.000Z', raisedBy: 'Meera', resolveBy: null, canReply: true, messages: [{ id: 'm1', side: 'agent', author: 'Divya', bodyHtml: '<p>Two people can start Monday.</p>', at: '2026-11-10T05:00:00.000Z' }] };
  const live = (tickets?: LiveClientPortal['tickets']): LiveClientPortal => ({
    tenant: 'Kaveri',
    tab: 'tickets',
    hrefFor: (t) => `?tab=${t}`,
    state: 'ready',
    onRetry: vi.fn(),
    ended: false,
    onSignInAgain: vi.fn(),
    onSignOut: vi.fn(),
    today: new Date(2026, 10, 10),
    data: { client: { name: 'Nilgiri', contact: 'Meera', email: 'meera@nilgiri.test', contractEnds: null }, jobs: [], submissions: [], timesheets: [], invoices: [], interviews: [], bookable: [] },
    onDecide: vi.fn(),
    onTimesheet: vi.fn(),
    onBook: vi.fn(),
    tickets,
  });
  const parts = () => ({ rows: [{ id: 't1', number: 'CS-7', subject: 'Replace the night operator', category: 'Replacement', priority: 'Normal', raisedOn: '2026-11-10T04:00:00.000Z', resolveBy: null, paused: false, status: 'Open' }], onRaise: vi.fn().mockResolvedValue({ id: 't2', number: 'CS-8' }), load: vi.fn().mockResolvedValue(view), onReply: vi.fn().mockResolvedValue({}) });
  it('raising needs a category and a subject; then it is sent and a toast says the number', async () => {
    const k = parts();
    wrap(<ClientPortalScreen live={live(k)} />);
    expect(screen.getByText('CS-7')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Raise ticket' }));
    expect(within(dialog).getByText('Choose a category.')).toBeInTheDocument();
    expect(within(dialog).getByText('Add a short subject.')).toBeInTheDocument();
    expect(k.onRaise).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('combobox'));
    await ue.click(await screen.findByRole('option', { name: 'Billing' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Subject/ }), 'GST number wrong');
    await ue.click(within(dialog).getByRole('button', { name: 'Raise ticket' }));
    expect(k.onRaise).toHaveBeenCalledWith({ category: 'Billing', subject: 'GST number wrong' });
    expect((await screen.findAllByText('Ticket CS-8 raised')).length).toBeGreaterThan(0);
  });
  it('opens a ticket with its replies; an empty reply is stopped; a reply is sent', async () => {
    const k = parts();
    wrap(<ClientPortalScreen live={live(k)} />);
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Two people can start Monday.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByText('Write your reply first.')).toBeInTheDocument();
    expect(k.onReply).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Your reply/ }), 'Thanks');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(k.onReply).toHaveBeenCalledWith('t1', 'Thanks');
    expect((await screen.findAllByText('Reply sent')).length).toBeGreaterThan(0);
  });
  it('a failed raise shows the reason and keeps the dialog open', async () => {
    const k = { ...parts(), onRaise: vi.fn().mockRejectedValue(new Error('Tickets are not set up yet. Write to your account manager.')) };
    wrap(<ClientPortalScreen live={live(k)} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox'));
    await ue.click(await screen.findByRole('option', { name: 'Access' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Subject/ }), 'Add an approver');
    await ue.click(within(dialog).getByRole('button', { name: 'Raise ticket' }));
    expect(await within(dialog).findByText('Tickets are not set up yet. Write to your account manager.')).toBeInTheDocument();
  });
  it('without tickets the tab is not offered', () => {
    wrap(<ClientPortalScreen live={{ ...live(), tab: 'jobs' }} />);
    expect(screen.queryByRole('link', { name: 'Tickets' })).not.toBeInTheDocument();
  });
});

describe('491: Settings 6.2 client portal tickets go to', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.2')!;
  const data = (values: Record<string, string>): StaffingSettingsData => ({ canEdit: true, values, defaults: { 'staffing.portal.tickets_team': 'account_manager' }, choices: { 'staffing.portal.tickets_team': ['account_manager', 'g1'] }, teams: [{ value: 'g1', label: 'Client support · Staffing team' }], lastChange: null, financialYear: '2026-27', entities: [], series: [] });
  const field = (p: ReturnType<typeof staffingSettingsPage>) => p.sections.flatMap((s) => s.settings).find((s) => s.key === 'staff.portal_tickets');
  it('offers the account manager and the Helpdesk teams by name, and saves the chosen team', () => {
    const f = field(staffingSettingsPage(design, data({ 'staffing.portal.tickets_team': 'g1' })))!;
    expect(f).toMatchObject({ kind: 'select', value: 'g1', options: ['account_manager', 'g1'], starter: false });
    expect(f.optionLabels).toMatchObject({ account_manager: "The client's account manager", g1: 'Client support · Staffing team' });
    expect(staffingSettingsChanges({ 'staff.portal_tickets': 'g1' })).toEqual([{ key: 'staffing.portal.tickets_team', value: 'g1' }]);
  });
  it('an older API without the setting: not shown', () => {
    expect(field(staffingSettingsPage(design, data({})))).toBeUndefined();
  });
});
