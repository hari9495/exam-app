import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxStaffingInvoicePage from './(app)/staffing/invoices/[id]/page';
import YxStaffingPlacementPage from './(app)/staffing/placements/[id]/page';
import YxStaffingInvoicesPage from './(app)/staffing/invoices/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Staffing round 4: the invoice PDF download (492) and the placement fee (494) on the live pages.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const blob = apiFetchBlob as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const calls: [string, unknown][] = [];
const INV = { canEdit: false, invoice: { id: 'i1', number: 'KS/1', kind: 'staffing', creditOf: null, client: 'Nilgiri', clientState: 'Tamil Nadu', supplierState: 'Karnataka', interState: true, gstPct: '18', date: '2026-11-01', dueOn: '2026-12-01', period: null, po: null, reason: null, taxable: '100.00', cgst: '0.00', sgst: '0.00', igst: '18.00', total: '118.00', paid: '0.00', outstanding: '118.00', status: 'issued', irn: 'not_needed', version: 2, window: null }, lines: [], creditNotes: [], rule: { reportWithinDays: 30, warnFromDay: 25 } };
const PL = { id: 'p1', person: 'Arun Kumar', role: 'Java Developer', unit: 'hour', clientId: 'c1', client: 'Nilgiri', supply: 'own', vendor: null, startOn: '2026-09-01', endOn: '2027-01-31', status: 'active', endedReason: null, billRate: '1200.00', costRate: '800.00', statutory: '0.00', margin: '400.00', marginPct: '33.3', version: 1 };
beforeEach(() => {
  api.mockReset();
  blob.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/staffing/invoices/i1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return (calls.push([`${init.method} ${path}`, init.body ? JSON.parse(String(init.body)) : null]), { id: 'x' });
    if (path === '/staffing/invoices/i1') return INV;
    if (path === '/staffing/placements/p1') return { canManage: true, showPay: true, placement: PL, fee: { hiredOn: null, ctc: null, feeInvoice: null, leftOn: null, guarantee: null, terms: true, series: [{ value: 's1', label: 'KS/' }] } };
    if (path === '/staffing/placements/p1/hours') return { canEnter: true, contacts: [], rows: [] };
    throw new Error(`unexpected ${path}`);
  });
  global.URL.createObjectURL = jest.fn(() => 'blob:x');
  global.URL.revokeObjectURL = jest.fn();
});

it('492: a reader downloads the invoice PDF from the record', async () => {
  (useParams as jest.Mock).mockReturnValue({ id: 'i1' });
  blob.mockResolvedValue({ blob: new Blob(['%PDF-']), filename: 'KS_1.pdf' });
  wrap(<YxStaffingInvoicePage />);
  await ue.click(await screen.findByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(blob).toHaveBeenCalledWith('/staffing/invoices/i1/pdf', {}, 'tok'));
});

it('494: the hire goes to the API with the CTC as exact rupee text', async () => {
  (useParams as jest.Mock).mockReturnValue({ id: 'p1' });
  wrap(<YxStaffingPlacementPage />);
  await ue.click(await screen.findByRole('button', { name: 'Client hired Arun Kumar' }));
  const dialog = await screen.findByRole('dialog');
  await ue.type(within(dialog).getByLabelText(/First-year CTC/), '1800000');
  await ue.click(within(dialog).getByRole('button', { name: 'Record the hire' }));
  await waitFor(() => expect(calls).toEqual([['POST /staffing/placements/p1/hired', { hiredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ctc: '1800000.00', seriesId: 's1', endPlacement: true }]]));
});

it('522: Export to accounting downloads the chosen series, month and format', async () => {
  (useParams as jest.Mock).mockReturnValue({});
  api.mockImplementation(async (path: string) => {
    if (path === '/staffing/invoices') return { canCreate: true, rows: [] };
    if (path === '/staffing/invoices/options') return { clients: [], series: [] };
    if (path === '/staffing/exports/options') return { series: [{ id: 's1', label: 'KS/ · 29AABCK1234F1Z5 · 2026-27', months: ['2026-10'], drafts: 1 }] };
    throw new Error(`unexpected ${path}`);
  });
  blob.mockResolvedValue({ blob: new Blob(['<x/>']), filename: 'KS-2026-10-tally.xml' });
  wrap(<YxStaffingInvoicesPage />);
  await ue.click(await screen.findByRole('button', { name: 'Export to accounting' }));
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByText(/1 draft is not exported/)).toBeInTheDocument();
  await ue.click(within(sheet).getByRole('button', { name: 'Download' }));
  await waitFor(() => expect(blob).toHaveBeenCalledWith('/staffing/exports?seriesId=s1&month=2026-10&format=tally', {}, 'tok'));
});
