import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskTicketPage from './(app)/desk/tickets/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Tickets › one ticket: the designed HLP-03 workspace with `live` (Helpdesk design wiring, round 3).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const DESK = { id: 'd1', key: 'IT', name: 'IT help desk', kind: 'it', attachmentTypes: ['pdf'], attachmentMaxMb: 10, myRole: 'agent', canWork: true, autoCloseDays: 3 };
const DETAIL = {
  desk: DESK,
  statuses: [
    { id: 's-open', label: 'In progress', systemState: 'open', active: true, ticketTypeId: null },
    { id: 's-wait', label: 'Waiting on employee', systemState: 'pending', active: true, ticketTypeId: null },
    { id: 's-done', label: 'Resolved', systemState: 'solved', active: true, ticketTypeId: null },
  ],
  members: [{ userId: 'u-me', name: 'Suresh', role: 'agent', active: true }],
  groups: [],
  categories: [],
  types: [],
  scenarios: [],
};
const TICKET = {
  id: 't1', number: 'IT-1001', deskId: 'd1', subject: 'VPN keeps dropping', kind: 'incident', systemState: 'open', statusId: 's-open', typeId: 'ty1', categoryId: null, groupId: null, priority: 2, impact: 3, urgency: 3,
  assigneeUserId: null, channel: 'portal', sensitive: false, private: false, vip: false, tags: [], firstResponseAt: null, resolvedAt: null, version: 4, createdAt: '2026-11-01T04:30:00Z', updatedAt: '2026-11-01T04:30:00Z',
  access: 'agent', canWork: true, canNote: true, canAssignOthers: false, desk: { id: 'd1', key: 'IT', name: 'IT help desk', audience: 'employee' }, type: { id: 'ty1', name: 'Incident' }, status: { id: 's-open', label: 'In progress' },
  category: null, group: null, requester: { id: 'p1', name: 'Arjun Kulkarni', email: 'arjun@x.test' }, requestedFor: null, assignee: null, openedBy: null,
  messages: [{ id: 'm1', kind: 'reply', side: 'requester', author: 'Arjun Kulkarni', bodyHtml: '<p>It drops every hour.</p>', createdAt: '2026-11-01T04:30:00Z', editedAt: null, fromTicketId: null }],
  attachments: [], watchers: [], collaborators: [], time: { totalMinutes: 0, entries: [] },
};
function route() {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}${init?.body ? ` ${String(init.body)}` : ''}`);
    const p = path.split('?')[0];
    if (p === '/users/me') return { id: 'u-me', name: 'Suresh', email: 's@x.test' };
    if (p === '/desk/tickets/t1') return TICKET;
    if (p === '/desk/desks/d1') return DETAIL;
    if (p === '/desk/desks') return [DESK];
    if (p === '/desk/tickets/t1/work') return { parent: null, children: [], merged: [], mergedInto: null, links: [], sideConversations: [], tasks: [], sla: [], reminders: [], maskedValues: [], canUnmask: false, canSeeReads: false, canExclude: false, canMerge: false };
    if (p === '/desk/tickets/t1/context') return { person: null, vip: false, employee: null, otherTickets: [], assets: [] };
    if (p === '/desk/desks/d1/templates') return { templates: [], resolutionCodes: [] };
    if (p === '/desk/tickets/t1/request') return null;
    if (p === '/desk/tickets/t1/documents') return { documents: [], templates: [] };
    if (init?.method === 'PATCH' || init?.method === 'POST') return [];
    return [];
  });
}

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useParams as jest.Mock).mockReturnValue({ id: 't1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Tickets › one ticket (HLP-03 live)', () => {
  it('shows the design workspace; Wait on employee sets the waiting status with the version', async () => {
    route();
    wrap(<YxDeskTicketPage />);
    expect(await screen.findByText('It drops every hour.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reply to Arjun' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Wait on employee' }));
    await waitFor(() => expect(calls).toContain('PATCH /desk/tickets/t1 {"version":4,"statusId":"s-wait"}'));
  });

  it('a 403 shows the no-access state', async () => {
    route();
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => (path === '/desk/tickets/t1' ? Promise.reject(Object.assign(new Error('Not on this desk'), { status: 403 })) : base(path, init)));
    wrap(<YxDeskTicketPage />);
    expect(await screen.findByText(/You don't have access to this ticket/)).toBeInTheDocument();
  });
});
