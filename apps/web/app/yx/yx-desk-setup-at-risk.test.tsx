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

// Desk set-up › Settings: the desk's at-risk point (HLP-05b, founder 3 Nov 2026): 50 to 90 % of a response target,
// default 80, saved with the desk's other settings (PATCH desk/desks/:id, desk.settings.manage).
const DESK = { id: 'd1', key: 'IT', name: 'IT help desk', kind: 'it', privacy: 'standard', numberPrefix: 'IT-', numberSuffix: '', attachmentTypes: ['pdf'], attachmentMaxMb: 10, vipRaisesPriority: false, calendarId: null, atRiskPercent: 80, version: 1, myRole: 'admin', canWork: false };
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
    if (p === '/desk/desks/d1') return init?.method === 'PATCH' ? { ...DESK, version: 2, atRiskPercent: 60 } : DETAIL;
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
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('tab=settings'));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

it('a desk admin sets the at-risk point to 60 % (PATCH with the desk version) and sees a toast', async () => {
  route(['desk.settings.manage']);
  wrap();
  const g = await screen.findByRole('radiogroup', { name: 'At risk from' });
  expect(within(g).getByRole('radio', { name: '80 %' })).toBeChecked();
  await userEvent.click(within(g).getByRole('radio', { name: '60 %' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => expect(calls.some((c) => c.startsWith('PATCH /desk/desks/d1 ') && c.includes('"version":1') && c.includes('"atRiskPercent":60'))).toBe(true));
  expect((await screen.findAllByText('Desk settings saved.')).length).toBeGreaterThan(0);
});
