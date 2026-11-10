import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxConvertWorkerPage from './(app)/contract-labour/workers/[id]/convert/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: 'http://api', apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// CL-7 (CLB-05, answer 637): the convert page on the joiner API.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
const DATA = { deploymentId: 'd1', version: 2, canStart: true, block: null, person: { id: 'p1', name: 'Murugan S', email: null, phone: null }, rehire: false, contractor: 'Sri Lakshmi', site: { id: 'hsr', name: 'Hosur plant', legalEntityId: 'tn' }, fromOn: '2026-01-05', gatePass: 'GP-1', uan: null, esicIp: null, idMasked: 'XXXX XXXX 4417', today: '2026-11-12' };
const calls: [string, string, unknown][] = [];

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useParams as jest.Mock).mockReturnValue({ id: 'd1' });
});

const routes = (prefill: unknown) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      calls.push([init!.method!, path, JSON.parse(String(init!.body))]);
      return { id: 'pb1', journeyId: 'j1' };
    }
    if (path === '/lifecycle/joiners/from-contract-worker/d1') {
      if (prefill instanceof Error) throw prefill;
      return prefill;
    }
    if (path === '/org/legal-entities') return [{ id: 'tn', name: 'Kaveri Foods Pvt Ltd' }];
    if (path === '/org/locations') return [{ id: 'hsr', name: 'Hosur plant', legalEntityId: 'tn' }];
    if (path.startsWith('/org/masters') || path.startsWith('/people')) return [];
    throw Object.assign(new Error(`unexpected ${path}`), { status: 404 });
  });

describe('Contract worker conversion page (live)', () => {
  it('starts pre-boarding from the deployment and opens the new checklist', async () => {
    routes(DATA);
    wrap(<YxConvertWorkerPage />);
    expect(await screen.findByText('Make Murugan S an employee')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.type(screen.getByLabelText(/^Joining date/), '01/12/2026');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(screen.getByRole('button', { name: 'Start pre-boarding' }));
    await waitFor(() => expect(calls).toEqual([['POST', '/lifecycle/joiners/from-contract-worker/d1', expect.objectContaining({ joiningOn: '2026-12-01', legalEntityId: 'tn', locationId: 'hsr', version: 2 })]]));
    expect(push).toHaveBeenCalledWith('/yx/people/onboarding/pb1');
  });

  it('without the onboarding key the page says no access', async () => {
    routes(Object.assign(new Error('forbidden'), { status: 403 }));
    wrap(<YxConvertWorkerPage />);
    expect(await screen.findByText(/the onboarding key/)).toBeInTheDocument();
  });
});
