import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CollectionsScreen, InvoiceRecordScreen, InvoicesScreen, LiveEInvoiceBanner, VendorInvoices, PlacementFeeSettingsScreen, PlacementHours, type InvoiceDetail, type LedgerRowView } from './hiring-staffing';
import { CreateInvoicesSheet } from './staffing-sheets';
import { ClientPortalScreen, type LiveClientPortal } from '../portals/t9-business';
import { staffingSettingsChanges } from '../settings/staffing-live';

// Staffing desk slice 3 (HIR-18, HIR-19, HIR-30, HIR-31, T9-06, Settings 6.2): live views, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const RULE = { reportWithinDays: 30, warnFromDay: 25 };
const DETAIL = (over: Partial<InvoiceDetail['invoice']> = {}): InvoiceDetail => ({
  canEdit: true,
  invoice: { id: 'i1', number: 'KS/41', kind: 'staffing', creditOf: null, client: 'Nilgiri', clientState: 'Tamil Nadu', supplierState: 'Karnataka', interState: true, gstPct: '18', date: '2026-11-01', dueOn: '2026-12-01', period: '2026-10-01 to 2026-10-31', po: null, reason: null, taxable: '1000.00', cgst: '0.00', sgst: '0.00', igst: '180.00', total: '1180.00', paid: '0.00', outstanding: '1180.00', status: 'issued', irn: 'not_needed', version: 2, window: null, ...over },
  lines: [{ description: 'Arun · Java · 10 h', qty: '10', rate: '100.00', amount: '1000.00' }],
  creditNotes: [],
  rule: RULE,
});
const rec = (over: Partial<InvoiceDetail['invoice']> = {}, canEdit = true) => ({ state: 'ready' as const, onRetry: vi.fn(), data: { ...DETAIL(over), canEdit }, onIssue: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined), onCreditNote: vi.fn().mockResolvedValue(undefined), onReissue: vi.fn().mockResolvedValue(undefined), onOpen: vi.fn() });

describe('HIR-18 invoices (live)', () => {
  it('the list: Create invoices only for finance; credit notes count negative', () => {
    const rows = [
      { id: 'i1', number: 'KS/41', client: 'Nilgiri', kind: 'staffing' as const, date: '2026-11-01', period: '2026-10', taxable: '1000.00', gst: '180.00', total: '1180.00', status: 'issued' as const, irn: { days: 27, state: 'warning' as const } },
      { id: 'c1', number: 'KS/CN1', client: 'Nilgiri', kind: 'credit_note' as const, date: '2026-11-02', period: null, taxable: '100.00', gst: '18.00', total: '118.00', status: 'issued' as const, irn: 'not_needed' as const },
    ];
    const { unmount } = wrap(<InvoicesScreen live={{ state: 'ready', onRetry: vi.fn(), rows, canCreate: true, onCreate: vi.fn(), onOpen: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'Create invoices' })).toBeInTheDocument();
    expect(screen.getByText('Pending · day 27')).toBeInTheDocument();
    unmount();
    wrap(<InvoicesScreen live={{ state: 'ready', onRetry: vi.fn(), rows, canCreate: false, onCreate: vi.fn(), onOpen: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Create invoices' })).not.toBeInTheDocument();
  });
  it('a draft is issued after a confirmation; an issued one only takes a credit note, never more than is left', async () => {
    const draft = rec({ number: null, status: 'draft', date: null, dueOn: null });
    const { unmount } = wrap(<InvoiceRecordScreen live={draft} />);
    await ue.click(screen.getByRole('button', { name: 'Issue invoice' }));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Issue invoice' }));
    await waitFor(() => expect(draft.onIssue).toHaveBeenCalled());
    unmount();
    const issued = rec();
    wrap(<InvoiceRecordScreen live={issued} />);
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Raise credit note' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Taxable amount/), '1200');
    await ue.click(within(sheet).getByRole('button', { name: 'Issue credit note' }));
    expect(within(sheet).getByText('That is more than is left on the invoice.')).toBeInTheDocument();
    expect(within(sheet).getByText(/Say why/)).toBeInTheDocument();
    expect(issued.onCreditNote).not.toHaveBeenCalled();
  });
  it('a reader (account manager) gets no actions', () => {
    wrap(<InvoiceRecordScreen live={rec({}, false)} />);
    expect(screen.queryByRole('button', { name: 'Raise credit note' })).not.toBeInTheDocument();
  });
  it('the e-invoice banner follows the rule data; blocked offers cancel and reissue; the IRP is not connected', async () => {
    const onReissue = vi.fn();
    const { unmount } = wrap(<LiveEInvoiceBanner window={{ days: 27, state: 'warning' }} invoiceNo="KS/41" invoiceDate="2026-10-05" rule={RULE} />);
    expect(screen.getByText('Day 27 of 30: report for IRN soon')).toBeInTheDocument();
    unmount();
    const r2 = wrap(<LiveEInvoiceBanner window={{ days: 33, state: 'blocked' }} invoiceNo="KS/41" invoiceDate="2026-10-05" rule={RULE} onReissue={onReissue} />);
    await ue.click(screen.getByRole('button', { name: 'Cancel and reissue' }));
    expect(onReissue).toHaveBeenCalled();
    r2.unmount();
    wrap(<InvoiceRecordScreen live={rec({ irn: 'pending', window: { days: 3, state: 'ok' } })} />);
    await ue.click(screen.getByRole('button', { name: 'Send for IRN' }));
    expect(await screen.findByText('The IRP is not connected')).toBeInTheDocument();
  });
  it('create invoices: each choice is required; the months are the client’s', async () => {
    const onSave = vi.fn();
    wrap(<CreateInvoicesSheet open onOpenChange={vi.fn()} options={{ clients: [{ id: 'c1', name: 'Nilgiri', months: ['2026-10'] }, { id: 'c2', name: 'Coromandel', months: [] }], series: [] }} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Create drafts' }));
    expect(screen.getByText('Choose the client.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('HIR-19 receivables (live)', () => {
  const ROWS: LedgerRowView[] = [{ invoiceId: 'i1', invoice: 'KS/41', clientId: 'c1', client: 'Nilgiri', tdsSection: '194C', date: '2026-10-01', dueOn: '2026-10-31', bucket: '31–60', overdueDays: 10, total: '1180.00', outstanding: '1180.00', tdsDeducted: '0.00', tds26as: null, dispute: null, nextReminder: '2026-11-07', version: 1 }];
  it('a receipt must add up: amount + TDS = the allocations; never more than outstanding', async () => {
    const onReceipt = vi.fn().mockResolvedValue(undefined);
    wrap(<CollectionsScreen live={{ state: 'ready', onRetry: vi.fn(), rows: ROWS, canRecord: true, today: new Date(2026, 10, 10), onReceipt, onCollection: vi.fn() }} />);
    expect(screen.getByText('Not in 26AS yet')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record receipt' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Amount received/), '1000');
    await ue.click(within(sheet).getByRole('button', { name: 'Save receipt' }));
    expect(within(sheet).getByText(/Allocate ₹1,000 more/)).toBeInTheDocument();
    await ue.type(within(sheet).getByLabelText('Allocate to KS/41'), '1200');
    expect(within(sheet).getByText('More than is outstanding on KS/41.')).toBeInTheDocument();
    expect(onReceipt).not.toHaveBeenCalled();
    await ue.clear(within(sheet).getByLabelText('Allocate to KS/41'));
    await ue.type(within(sheet).getByLabelText('Allocate to KS/41'), '1000');
    await ue.click(within(sheet).getByRole('button', { name: 'Save receipt' }));
    await waitFor(() => expect(onReceipt).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', amount: 1000, tds: 0, allocations: [{ invoiceId: 'i1', amount: 1000 }] })));
  });
  it('no record button for a reader', () => {
    wrap(<CollectionsScreen live={{ state: 'ready', onRetry: vi.fn(), rows: ROWS, canRecord: false, today: new Date(2026, 10, 10), onReceipt: vi.fn(), onCollection: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Record receipt' })).not.toBeInTheDocument();
  });
});

describe('HIR-30 fees and guarantee (live)', () => {
  it('saves the terms as exact text; a taper that rises is refused; finance reads only', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const base = { state: 'ready' as const, onRetry: vi.fn(), client: 'Nilgiri', contract: null, terms: null, onSave, onCancel: vi.fn() };
    const { unmount } = wrap(<PlacementFeeSettingsScreen live={{ ...base, canEdit: true }} />);
    const row2 = screen.getByLabelText('Row 2 fee');
    await ue.clear(row2);
    await ue.type(row2, '9');
    await ue.click(screen.getByRole('button', { name: 'Save contract terms' }));
    expect(screen.getByText(/no higher than the row before/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(row2);
    await ue.type(row2, '6');
    await ue.click(screen.getByRole('button', { name: 'Save contract terms' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ feeKind: 'percent', feePct: '8.33', guaranteeDays: 90, remedy: 'replace', taper: [{ fromMonth: 0, pct: '8.33' }, { fromMonth: 3, pct: '6.00' }, { fromMonth: 6, pct: '4.00' }, { fromMonth: 12, pct: '0.00' }] })));
    unmount();
    wrap(<PlacementFeeSettingsScreen live={{ ...base, canEdit: false }} />);
    expect(screen.queryByRole('button', { name: 'Save contract terms' })).not.toBeInTheDocument();
  });
});

describe('hours and vendor invoices (live)', () => {
  it('a week must start on a Monday; recording an approval needs the contact', async () => {
    const onSave = vi.fn();
    const onApprove = vi.fn().mockResolvedValue(undefined);
    wrap(<PlacementHours live={{ canEnter: true, today: new Date(2026, 10, 10), contacts: [{ id: 'k1', name: 'Meera', role: 'HR' }, { id: 'k2', name: 'Ravi', role: 'TA' }], rows: [{ id: 'h1', weekStart: '2026-11-02', hours: '40', overtime: '0', status: 'waiting', note: null, invoiced: false, version: 1 }], onSave, onApprove }} />);
    await ue.click(screen.getByRole('button', { name: 'Enter a week' }));
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Send to client' }));
    expect(within(sheet).getByText(/Choose the Monday/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.keyboard('{Escape}');
  });
  it('a vendor invoice is confirmed only with the vendor’s number', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    wrap(<VendorInvoices live={{ canEdit: true, onConfirm, onPaid: vi.fn(), rows: [{ id: null, status: 'waiting', vendorInvoiceNo: null, vendor: 'Velocity', worker: 'Priya', placementId: 'p1', month: '2026-10', hours: '40', rate: '900.00', net: '36000.00', gst: '6480.00', tdsSection: '194C', tds: '720.00' }] }} />);
    expect(screen.getByText(/40 h × ₹900 = ₹36,000 \+ GST ₹6,480 · TDS 194C ₹720/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Vendor confirmed' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText("Enter the vendor's invoice number.")).toBeInTheDocument();
    await ue.type(within(dialog).getByLabelText(/invoice number/), 'VT/044');
    await ue.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('p1', '2026-10', 'VT/044', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
  });
});

describe('T9-06 client portal (live)', () => {
  const live = (over: Partial<LiveClientPortal> = {}): LiveClientPortal => ({
    tenant: 'Kaveri Staffing',
    tab: 'submissions',
    hrefFor: (t) => `?tab=${t}`,
    state: 'ready',
    onRetry: vi.fn(),
    ended: false,
    onSignInAgain: vi.fn(),
    onSignOut: vi.fn(),
    today: new Date(2026, 10, 10),
    data: { client: { name: 'Nilgiri', contact: 'Meera', email: 'meera@nilgiri.test', contractEnds: '2027-03-31' }, jobs: [], submissions: [{ id: 's1', candidate: 'Deepa Nair', job: 'Java Developer', submittedOn: '2026-11-01', status: 'New', feedback: null }], timesheets: [{ id: 't1', worker: 'Arun', role: 'Java Developer', weekStart: '2026-11-02', hours: '40', overtime: '0', vendor: null, status: 'Waiting for you', note: null }], invoices: [], },
    onDecide: vi.fn().mockResolvedValue(undefined),
    onTimesheet: vi.fn().mockResolvedValue(undefined),
    ...over,
  });
  it('reject needs a reason; the feedback goes with it', async () => {
    const l = live();
    wrap(<ClientPortalScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject with feedback' }));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
  });
  it('timesheets: approve one; a session that ended asks to sign in again', async () => {
    const l = live({ tab: 'timesheets' });
    const { unmount } = wrap(<ClientPortalScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(l.onTimesheet).toHaveBeenCalledWith('t1', 'approve'));
    unmount();
    wrap(<ClientPortalScreen live={live({ ended: true })} />);
    expect(screen.getByText('Your session ended.')).toBeInTheDocument();
  });
});

describe('Settings 6.2 slice 3', () => {
  it('maps reminders and e-invoicing to their company settings', () => {
    expect(staffingSettingsChanges({ 'staff.dunning': 'gentle', 'staff.einvoice': true })).toEqual([
      { key: 'staffing.dunning.schedule', value: 'gentle' },
      { key: 'staffing.einvoice.applies', value: 'on' },
    ]);
  });
});
