import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskReportsPage from './(app)/desk/reports/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › SLAs: the designed HLP-05 SLA dashboard with `live`, the desk reports as its tabs.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();
const calls: string[] = [];
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const DESK = { id: 'd1', key: 'IT', name: 'IT help desk', kind: 'it', myRole: 'lead', canWork: true, forwardTo: [] };
const ROW = { id: 't1', number: 'IT-1001', subject: 'VPN keeps dropping', deskId: 'd1', deskName: 'IT help desk', priority: 2, assignee: { id: 'u2', name: 'Farah Khan' }, resolution: { usedMinutes: 500, targetMinutes: 480, paused: false } };
const SLA = {
  from: '2026-10-05', to: '2026-11-03', open: 7, breachedNow: 1, atRiskCount: 1, atRiskHidden: 0,
  firstResponseMetPct: 80, firstResponseMetPctBefore: 75, articlePct: null, articlePctBefore: null, resolutionTarget: null,
  queues: [{ deskId: 'd1', name: 'IT help desk', met: 4, breached: 1 }],
  weeks: [{ week: '2026-10-27', metPct: 80 }], firstResponseWeeks: [{ week: '2026-10-27', metPct: 80 }],
  agents: [{ userId: 'u2', name: 'Farah Khan', desks: 'IT help desk', open: 3, atRisk: 1, rating: 4.5 }],
  atRisk: [ROW],
};
const perms = (keys: string[]) => ({ 'GET /rbac/me/permissions': keys, 'GET /desk/desks': [DESK] });

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › SLAs (HLP-05 live)', () => {
  it('shows the server figures, opens a ticket and reassigns an at-risk one', async () => {
    route({
      ...perms(['desk.report.view', 'desk.ticket.assign']),
      'GET /desk/reports/sla': SLA,
      'GET /desk/desks/d1/team': [{ userId: 'u2', name: 'Farah Khan' }, { userId: 'u3', name: 'Suresh Pillai' }],
      'POST /desk/tickets/t1/assign': { ok: true },
    });
    wrap(<YxDeskReportsPage />);
    expect(await screen.findByText('VPN keeps dropping')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('GET /desk/reports/sla?from='))).toBe(true);
    expect(within(screen.getByRole('region', { name: 'Open tickets' })).getByText('7')).toBeInTheDocument();
    await userEvent.click(screen.getByText('VPN keeps dropping'));
    expect(push).toHaveBeenCalledWith('/yx/desk/tickets/t1');
    await userEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reassign IT-1001' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Give it to/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Suresh Pillai' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }));
    await waitFor(() => expect(calls).toContain('POST /desk/tickets/t1/assign {"userId":"u3"}'));
    expect((await screen.findAllByText('IT-1001 is now with Suresh Pillai.')).length).toBeGreaterThan(0);
  });

  it('a queue choice is sent to the server', async () => {
    route({ ...perms(['desk.report.view']), 'GET /desk/reports/sla': SLA });
    wrap(<YxDeskReportsPage />);
    await screen.findByText('VPN keeps dropping');
    expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Queue' }));
    await userEvent.click(await screen.findByRole('option', { name: 'IT help desk' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('GET /desk/reports/sla?') && c.includes('deskId=d1'))).toBe(true));
  });

  it('surveys only: opens on Surveys and never asks for the SLA figures', async () => {
    route({ ...perms(['desk.survey.manage']), 'GET /desk/surveys': [] });
    wrap(<YxDeskReportsPage />);
    expect(await screen.findByText('No surveys yet.')).toBeInTheDocument();
    expect(calls.some((c) => c.includes('/reports/sla'))).toBe(false);
  });

  it('neither key: the no-access state', async () => {
    route(perms([]));
    wrap(<YxDeskReportsPage />);
    expect(await screen.findByText(/You don't have access to SLAs and desk reports/)).toBeInTheDocument();
  });
});
