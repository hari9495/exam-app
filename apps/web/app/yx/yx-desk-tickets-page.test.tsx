import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskTicketsPage from './(app)/desk/tickets/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Tickets: the designed HLP-02 agent desk with `live` (Helpdesk design wiring, round 2).
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
const DESK = { id: 'd1', key: 'IT', name: 'IT help desk', kind: 'it', myRole: 'agent', canWork: true, forwardTo: [] };
const DETAIL = { desk: DESK, statuses: [{ id: 's-wait', label: 'Waiting on employee', systemState: 'pending', active: true, ticketTypeId: null }], categories: [], scenarios: [] };
const ROW = { id: 't1', number: 'IT-1001', subject: 'VPN keeps dropping', deskId: 'd1', desk: 'IT help desk', type: 'Incident', statusId: 's-open', status: 'In progress', systemState: 'open', priority: 2, category: 'Network', group: null, requester: 'Arjun Kulkarni', requestedFor: null, assigneeUserId: null, assignee: null, tags: [], vip: false, sensitive: false, private: false, version: 3, sla: { dueAt: null, breached: false, paused: false }, resolution: { usedMinutes: 60, targetMinutes: 480, paused: false }, firstResponse: null, firstResponseAt: '2026-11-01T05:00:00Z', createdAt: '2026-11-01T04:30:00Z', updatedAt: '2026-11-01T04:30:00Z', canBulk: false, channel: 'portal' };
const BASE = {
  'GET /users/me': { id: 'u-me', name: 'Suresh', email: 's@x.test' },
  'GET /desk/desks': [DESK],
  'GET /desk/views': [],
  'GET /desk/tickets': { items: [ROW], total: 1, nextCursor: null },
  'GET /desk/desks/d1': DETAIL,
};

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Tickets (HLP-02 live)', () => {
  it('lists my open tickets with the resolution clock; the quick view assigns to me and opens the ticket', async () => {
    route({ ...BASE, 'POST /desk/tickets/t1/assign': { ok: true } });
    wrap(<YxDeskTicketsPage />);
    expect(await screen.findByText('VPN keeps dropping')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('GET /desk/tickets?') && c.includes('assignee=me'))).toBe(true);
    expect(screen.getByText(/7 h left/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('VPN keeps dropping'));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => expect(calls).toContain('POST /desk/tickets/t1/assign {"userId":"u-me"}'));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Open ticket' }));
    expect(push).toHaveBeenCalledWith('/yx/desk/tickets/t1');
  });

  it('a person with no desk seat (403) sees the no-access state', async () => {
    route({ ...BASE, 'GET /desk/desks': () => Promise.reject(Object.assign(new Error('You have no seat on a desk.'), { status: 403 })) });
    wrap(<YxDeskTicketsPage />);
    expect(await screen.findByText(/You don't have access to the agent desk/)).toBeInTheDocument();
  });
});
