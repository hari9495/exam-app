import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxClientSitesPage from './(app)/contract-labour/client-sites/page';
import YxOwnLicencesPage from './(app)/contract-labour/own-licences/page';
import YxClientPacksPage from './(app)/contract-labour/client-packs/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// CL-8 (CLB-06 … 08): the "we are the contractor" pages on /contract-labour. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const calls: [string, string][] = [];
const SITES = { canManage: true, clients: [{ id: 'c1', name: 'Nilgiri Pharma Ltd' }], sites: [{ id: 's1', clientId: 'c1', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit', principal: 'Nilgiri Pharma Ltd', registrationNo: 'TN/OSH/REG/2025/77410', state: 'IN-TN', address: null, packChannel: 'Vendor portal', packDueDay: 10, deployed: 2, max: 50, licenceNo: 'TN/1' }] };
const LICS = { canManage: true, today: '2026-11-11', entities: [{ value: 'e1', label: 'Kaveri Foods' }], sites: [{ value: 's1', label: 'Ambattur unit', state: 'IN-TN' }], licences: [{ id: 'l1', licenceNo: 'TN/OSH/CL/2026/2211', scope: 'Guards', clientSiteId: 's1', site: 'Ambattur unit', states: ['IN-TN'], maxWorkers: 50, deployed: 2, validFrom: '2026-01-01', validTo: '2027-03-31', authority: null, entity: 'Kaveri Foods' }] };
const PACKS = { canManage: true, today: '2026-11-11', sites: [{ value: 's1', label: 'Nilgiri Pharma Ltd · Ambattur unit' }], packs: [{ id: 'p1', client: 'Nilgiri Pharma Ltd', site: 'Ambattur unit', clientSiteId: 's1', month: '2026-10', employees: 2, due: '2026-11-10', channel: 'Vendor portal', status: 'Overdue', uploadedOn: null, reference: null, version: 1, missing: [], challans: true }] };

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['PK']), filename: 'client-pack-2026-10.zip' });
  Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:x'), revokeObjectURL: jest.fn() });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') return void calls.push([init!.method!, path]);
    if (path === '/contract-labour/client-sites') return SITES;
    if (path === '/contract-labour/own-licences') return LICS;
    if (path === '/contract-labour/client-packs') return PACKS;
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });
});

describe('We are the contractor pages (live)', () => {
  it('client sites list with the registration number', async () => {
    wrap(<YxClientSitesPage />);
    expect(await screen.findByText('TN/OSH/REG/2025/77410')).toBeInTheDocument();
    expect(screen.getByText('2 of 50')).toBeInTheDocument();
  });

  it('own licences list with use against the maximum', async () => {
    wrap(<YxOwnLicencesPage />);
    expect(await screen.findByText('TN/OSH/CL/2026/2211')).toBeInTheDocument();
    expect(screen.getByText('2 of 50')).toBeInTheDocument();
  });

  it('client packs: download the zip; a remake of the month asks why before posting (negative)', async () => {
    wrap(<YxClientPacksPage />);
    await ue.click(await screen.findByRole('button', { name: 'Download pack' }));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalledWith('/contract-labour/client-packs/p1/file', {}, 't'));
    await ue.click(screen.getByRole('button', { name: 'Make pack' }));
    await ue.click(screen.getAllByRole('button', { name: 'Make pack' }).at(-1)!);
    expect(await screen.findByText('Say why a new version is needed.')).toBeInTheDocument();
    expect(calls).toEqual([]);
    await ue.type(screen.getByLabelText(/Why a new version/), 'Attendance corrected');
    await ue.click(screen.getAllByRole('button', { name: 'Make pack' }).at(-1)!);
    await waitFor(() => expect(calls).toEqual([['POST', '/contract-labour/client-packs']]));
  });

  it('without the contract labour key the pages say no access', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });
    wrap(<YxClientPacksPage />);
    expect(await screen.findByText(/the contract labour key/)).toBeInTheDocument();
  });
});
