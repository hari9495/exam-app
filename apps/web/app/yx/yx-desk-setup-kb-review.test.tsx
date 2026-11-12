import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskSetupPage from './(app)/desk/setup/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Desk set-up › Requesters (answer 1804): the company's help-article review interval (HLP-04, founder 3 Nov 2026; registry
// desk.kb.review_months), for the company's Service Desk owner (desk.desk.create).
const DESK = { id: 'd1', key: 'IT', name: 'IT help desk', kind: 'it', privacy: 'standard', numberPrefix: 'IT-', numberSuffix: '', attachmentTypes: ['pdf'], attachmentMaxMb: 10, vipRaisesPriority: false, calendarId: null, version: 1, myRole: 'admin', canWork: false };
const DETAIL = { desk: DESK, types: [], statuses: [], categories: [], groups: [], matrix: [], members: [], scenarios: [], myRole: 'admin', canSetUp: true, canManageMembers: false };
const api = apiFetch as jest.Mock;
const calls: string[] = [];

function route(perms: string[]) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    const p = path.split('?')[0];
    if (p === '/rbac/me/permissions') return perms;
    if (p === '/users/me') return { id: 'u1', name: 'Owner', email: 'o@x.test', timeZone: 'Asia/Kolkata' };
    if (p === '/desk/desks') return [DESK];
    if (p === '/desk/desks/d1') return DETAIL;
    if (p === '/desk/kb/settings') return init?.method === 'PUT' ? { reviewMonths: 6 } : { reviewMonths: 12, choices: [3, 6, 12, 24], defaultMonths: 12 };
    if (p === '/desk/setup/checklist') return { steps: [], done: 0, total: 0, standalone: false };
    if (p.startsWith('/desk/billing')) return { month: '2026-11', paidAgents: 0, collaborators: [] };
    if (p === '/desk/desks/d1/templates') return { codes: [], templates: [] };
    return [];
  });
}
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxDeskSetupPage />
      </ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('tab=requesters'));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

it('the Service Desk owner changes the review interval to 6 months (PUT desk/kb/settings)', async () => {
  route(['desk.desk.create', 'desk.settings.manage']);
  wrap();
  const g = await screen.findByRole('radiogroup', { name: 'Check help articles again every' });
  expect(within(g).getByRole('radio', { name: '12 months' })).toBeChecked();
  await userEvent.click(within(g).getByRole('radio', { name: '6 months' }));
  const card = g.closest('.yx-card') as HTMLElement;
  await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls).toContain('PUT /desk/kb/settings {"reviewMonths":6}'));
});

it('a desk admin without desk.desk.create does not see or load it', async () => {
  route(['desk.settings.manage']);
  wrap();
  expect(await screen.findByRole('button', { name: 'Save settings' })).toBeInTheDocument();
  expect(screen.queryByRole('radiogroup', { name: 'Check help articles again every' })).not.toBeInTheDocument();
  expect(calls.some((c) => c.includes('/desk/kb/settings'))).toBe(false);
});
