import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxRetrenchmentPage from './(app)/people/retrenchment/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// People › VRS schemes › Government permission (PPL-40; founder 2 Nov 2026, pay gaps item 1): the decision is sent with the
// optional government order number; a bad one is stopped in the dialog and nothing is sent.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const REQ = { id: 'ir1', legalEntityId: 'le1', kind: 'retrenchment', workersAffected: 12, reasons: 'Line closed', appliedOn: '2026-09-01', authority: 'Labour Commissioner, Chennai', status: 'applied', decidedOn: null, orderNumber: null, version: 3 };

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

it('records a grant with the order number, and refuses a bad one before sending', async () => {
  const posted: { path: string; body: unknown }[] = [];
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push({ path, body: JSON.parse(String(init.body)) });
      return { ok: true };
    }
    if (path === '/lifecycle/ir-permissions') return { workers: { le1: 342 }, requests: [REQ], schemes: [] };
    if (path === '/lifecycle/exits') return { today: '2026-09-29', rows: [] };
    if (path === '/org/legal-entities') return [{ id: 'le1', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }];
    return [];
  });
  wrap(<YxRetrenchmentPage />);
  await ue.click(await screen.findByRole('tab', { name: /Government permission/ }));
  await ue.click(await screen.findByRole('button', { name: 'Record the decision' }));
  const dialog = screen.getByRole('dialog');
  const field = within(dialog).getByRole('textbox', { name: /Order number/ });
  await ue.type(field, 'L-1 <b>');
  await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
  expect(within(dialog).getByText('Use letters, digits, spaces and . / ( ) - & , : _ only.')).toBeInTheDocument();
  expect(posted).toEqual([]);
  await ue.clear(field);
  await ue.type(field, 'L-42011/12/2026-IR(M)');
  await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ path: '/lifecycle/ir-permissions/ir1/decide', body: { status: 'granted', decidedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), orderNumber: 'L-42011/12/2026-IR(M)', version: 3 } });
  expect((await screen.findAllByText(/Decision on the retrenchment request at Kaveri Foods Pvt Ltd \(Tamil Nadu\) saved/)).length).toBeGreaterThan(0);
});
