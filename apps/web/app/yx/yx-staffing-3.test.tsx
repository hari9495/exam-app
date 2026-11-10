import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav, type NavInput } from '../../lib/yx-nav';
import YxStaffingInvoicesPage from './(app)/staffing/invoices/page';
import YxStaffingInvoicePage from './(app)/staffing/invoices/[id]/page';
import YxStaffingCollectionsPage from './(app)/staffing/collections/page';
import YxStaffingClientFeesPage from './(app)/staffing/clients/[id]/fees/page';
import YxClientPortalPage from './client/[org]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Staffing desk slice 3: the designed screens with `live` on /staffing/* and the client portal; menu; the API calls.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const push = jest.fn();
const calls: [string, unknown][] = [];
const INV = { canEdit: true, invoice: { id: 'i1', number: 'KS/41', kind: 'staffing', creditOf: null, client: 'Nilgiri', clientState: 'Tamil Nadu', supplierState: 'Karnataka', interState: true, gstPct: '18', date: '2026-11-01', dueOn: '2026-12-01', period: null, po: null, reason: null, taxable: '1000.00', cgst: '0.00', sgst: '0.00', igst: '180.00', total: '1180.00', paid: '0.00', outstanding: '1180.00', status: 'issued', irn: 'not_needed', version: 2, window: null }, lines: [{ description: 'Arun · 10 h', qty: '10', rate: '100.00', amount: '1000.00' }], creditNotes: [], rule: { reportWithinDays: 30, warnFromDay: 25 } };
const LEDGER = { canRecord: true, rows: [{ invoiceId: 'i1', invoice: 'KS/41', clientId: 'c1', client: 'Nilgiri', tdsSection: '194C', date: '2026-10-01', dueOn: '2026-10-31', bucket: '31–60', overdueDays: 10, total: '1180.00', outstanding: '1180.00', tdsDeducted: '0.00', tds26as: null, dispute: null, nextReminder: null, version: 1 }] };
const routes = (over: Record<string, unknown> = {}) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return (calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]), { id: 'x', ids: ['d1', 'd2'] });
    if (path in over) {
      const v = over[path];
      if (v instanceof Error) throw v;
      return v;
    }
    if (path === '/staffing/invoices') return { canCreate: true, rows: [] };
    if (path === '/staffing/invoices/options') return { clients: [{ id: 'c1', name: 'Nilgiri', months: ['2026-10'] }], series: [{ id: 's1', label: 'KS/ · 29AABCK1234F1Z5 · 2026-27', financialYear: '2026-27' }] };
    if (path === '/staffing/invoices/i1') return INV;
    if (path === '/staffing/receivables') return LEDGER;
    if (path === '/staffing/clients/c1/terms') return { client: { id: 'c1', name: 'Nilgiri', contractStart: '2026-04-01', contractEnd: '2027-03-31' }, canEdit: true, terms: null };
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/staffing/invoices');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'i1', org: 'kaveri' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('menu', () => {
  const base: NavInput = { has: () => false, role: 'panel', support: false, employee: false, manager: false, history: false, clearance: false, tasks: false, firstDays: false, staffing: true };
  const links = (n: ReturnType<typeof buildNav>) => n.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => l.href)));
  it('Invoices for finance and account managers; Collections for finance only; never recruiters', () => {
    const fin = links(buildNav({ ...base, has: (k) => k === 'ats.staffing.billing' }));
    expect(fin).toEqual(expect.arrayContaining(['/yx/staffing/invoices', '/yx/staffing/collections']));
    const am = links(buildNav({ ...base, has: (k) => k === 'ats.staffing.manage' }));
    expect(am).toContain('/yx/staffing/invoices');
    expect(am).not.toContain('/yx/staffing/collections');
    const rec = links(buildNav({ ...base, has: (k) => k === 'ats.staffing.view' }));
    expect(rec).not.toContain('/yx/staffing/invoices');
    expect(links(buildNav({ ...base, staffing: false, has: (k) => k === 'ats.staffing.billing' }))).not.toContain('/yx/staffing/invoices');
  });
});

describe('Staffing desk slice 3 pages', () => {
  it('invoices: Create invoices sends the client, month and series', async () => {
    routes();
    wrap(<YxStaffingInvoicesPage />);
    await ue.click((await screen.findAllByRole('button', { name: 'Create invoices' }))[0]!);
    const sheet = await screen.findByRole('dialog');
    await ue.click(within(sheet).getByRole('combobox', { name: /^Month/ }));
    await ue.click(await screen.findByRole('option', { name: /2026/ }));
    await ue.click(within(sheet).getByRole('button', { name: 'Create drafts' }));
    await waitFor(() => expect(calls).toEqual([['POST /staffing/invoices/draft', { clientId: 'c1', month: '2026-10', seriesId: 's1' }]]));
  });

  it('an invoice: a credit note goes as exact rupee text; acting for someone else has no actions', async () => {
    routes();
    const { unmount } = wrap(<YxStaffingInvoicePage />);
    await ue.click(await screen.findByRole('button', { name: 'Raise credit note' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Taxable amount/), '100.5');
    await ue.type(within(sheet).getByLabelText(/^Reason/), 'Duplicate hours');
    await ue.click(within(sheet).getByRole('button', { name: 'Issue credit note' }));
    await waitFor(() => expect(calls).toEqual([['POST /staffing/invoices/i1/credit-note', { amount: '100.50', reason: 'Duplicate hours' }]]));
    unmount();
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: true, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
    wrap(<YxStaffingInvoicePage />);
    expect(await screen.findByText('Invoice KS/41')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raise credit note' })).not.toBeInTheDocument();
  });

  it('collections: a receipt goes as exact rupee text; the desk off reads as such', async () => {
    routes();
    const { unmount } = wrap(<YxStaffingCollectionsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Record receipt' }));
    const sheet = await screen.findByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/^Amount received/), '1000');
    await ue.type(within(sheet).getByLabelText(/^TDS deducted/), '20.25');
    await ue.type(within(sheet).getByLabelText('Allocate to KS/41'), '1020.25');
    await ue.click(within(sheet).getByRole('button', { name: 'Save receipt' }));
    await waitFor(() => expect(calls).toEqual([['POST /staffing/receipts', expect.objectContaining({ clientId: 'c1', amount: '1000.00', tds: '20.25', allocations: [{ invoiceId: 'i1', amount: '1020.25' }] })]]));
    unmount();
    routes({ '/staffing/receivables': Object.assign(new Error('The staffing desk is off for your company.'), { status: 403 }) });
    wrap(<YxStaffingCollectionsPage />);
    expect(await screen.findByText('The staffing desk is off.')).toBeInTheDocument();
  });

  it('fees: saved as exact text', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    routes();
    wrap(<YxStaffingClientFeesPage />);
    await ue.click(await screen.findByRole('button', { name: 'Save contract terms' }));
    await waitFor(() => expect(calls).toEqual([['PUT /staffing/clients/c1/terms', expect.objectContaining({ feeKind: 'percent', feePct: '8.33', guaranteeDays: 90, remedy: 'replace' })]]));
  });

  it('the client portal starts at the email sign-in', async () => {
    routes();
    wrap(<YxClientPortalPage />);
    expect(await screen.findByText('Sign in to the client portal')).toBeInTheDocument();
  });
});
