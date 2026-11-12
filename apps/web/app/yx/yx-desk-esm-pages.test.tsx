import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { deskSamples } from '@yukthix/ui/desk';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskCatalogPage from './(app)/desk/catalog/page';
import YxDeskChatPage from './(app)/desk/chat/page';
import YxDeskLiveChatPage from './(app)/desk/live-chat/page';
import YxDeskTeamPage from './(app)/desk/team/page';
import YxDeskMyTicketPage from './(app)/desk/help/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/yx-desk-chat', () => ({ useDeskChat: () => ({ live: { connected: true, typing: false }, send: jest.fn(), seen: jest.fn(), typing: jest.fn() }) }));
jest.mock('../../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { id: 'u1', timeZone: 'Asia/Kolkata' } }) }));

// Helpdesk HLP-15 to HLP-19 (12 Nov 2026): the drawn screens are the live pages: the catalogue, chat with a desk (requester
// and agent), the desk team, and a requester's request (tracker and documents). Positive and negative per page.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const calls: string[] = [];
const forbidden = () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 }));
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    calls.push(key);
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const v = table[key];
    return typeof v === 'function' ? (v as () => unknown)() : v;
  });
}
const DESK = { id: 'd-it', name: 'IT help desk', key: 'IT' };

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('HLP-15 Service catalogue (/yx/desk/catalog)', () => {
  it('lists the items the person may order and opens one from the API', async () => {
    route({ 'GET /desk/my/catalog': deskSamples.CATALOGUE, 'GET /desk/my/catalog/items/i1': deskSamples.LAPTOP_PAGE });
    wrap(<YxDeskCatalogPage />);
    expect((await screen.findAllByText('New laptop')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Open New laptop' }));
    await waitFor(() => expect(calls).toContain('GET /desk/my/catalog/items/i1'));
  });

  it('negative: refused by the API, the page says it could not load (nothing to order is never shown as a sample)', async () => {
    route({ 'GET /desk/my/catalog': () => Promise.reject(Object.assign(new Error('Server error'), { status: 500 })) });
    wrap(<YxDeskCatalogPage />);
    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByText('New laptop')).toBeNull();
  });
});

describe('HLP-16 Chat with a desk', () => {
  it('a requester sees their chats and the open queues (/yx/desk/chat)', async () => {
    route({ 'GET /desk/my/chat/queues': deskSamples.CHAT_QUEUES, 'GET /desk/my/chat': [deskSamples.CHAT, deskSamples.CHAT_ENDED] });
    wrap(<YxDeskChatPage />);
    expect((await screen.findAllByText('VPN keeps dropping')).length).toBeGreaterThan(0);
  });

  it('negative: an agent page without the chat key says no access (/yx/desk/live-chat)', async () => {
    route({ 'GET /desk/desks': forbidden });
    wrap(<YxDeskLiveChatPage />);
    expect(await screen.findByText(/You don't have access/)).toBeInTheDocument();
  });
});

describe('HLP-17 Desk team and shifts (/yx/desk/team)', () => {
  it('a team lead sees the team and the week\'s shifts', async () => {
    route({
      'GET /rbac/me/permissions': ['desk.ticket.assign'],
      'GET /desk/desks': [DESK],
      [`GET /desk/desks/d-it/team`]: deskSamples.TEAM,
      [`GET /desk/desks/d-it/shifts`]: deskSamples.SHIFTS,
    });
    wrap(<YxDeskTeamPage />);
    expect((await screen.findAllByText('Suresh Pillai')).length).toBeGreaterThan(0);
    expect(calls).toContain('GET /desk/desks/d-it/team');
  });

  it('negative: without the lead or report key the team list is never asked for', async () => {
    route({ 'GET /rbac/me/permissions': [], 'GET /desk/desks': [DESK], 'GET /desk/desks/d-it/shifts': [] });
    wrap(<YxDeskTeamPage />);
    await waitFor(() => expect(calls).toContain('GET /desk/desks/d-it/shifts'));
    expect(calls).not.toContain('GET /desk/desks/d-it/team');
    expect(screen.queryByText('Suresh Pillai')).toBeNull();
  });
});

describe('HLP-19 My request (/yx/desk/help/[id])', () => {
  const TICKET = { id: 't1', number: 'IT-1020', subject: 'New laptop', desk: { name: 'IT help desk', attachmentTypes: ['pdf'], attachmentMaxMb: 10 }, history: [], status: 'In progress', systemState: 'open', private: false, role: 'requester', createdAt: '2026-11-01T04:30:00Z', updatedAt: '2026-11-01T04:30:00Z', clock: null, resolvedAt: null, closedAt: null, closesOn: null, reopenUntil: null, rating: null, canRate: false, messages: [], attachments: [], watchers: [], canReply: true, desks: [] };
  beforeEach(() => (useParams as jest.Mock).mockReturnValue({ id: 't1' }));

  it('the request shows its stages with the approval route, and the documents to sign', async () => {
    route({ 'GET /desk/my/tickets/t1': TICKET, 'GET /desk/my/requests/t1': deskSamples.MY_REQUEST, 'GET /desk/my/requests/t1/documents': deskSamples.DOCUMENTS });
    wrap(<YxDeskMyTicketPage />);
    expect((await screen.findAllByRole('button', { name: /Cancel this/ })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Read and sign' }).length).toBeGreaterThan(0);
  });

  it('negative: a ticket with no request and no documents shows neither card', async () => {
    route({ 'GET /desk/my/tickets/t1': TICKET, 'GET /desk/my/requests/t1': { ...deskSamples.MY_REQUEST, items: [] }, 'GET /desk/my/requests/t1/documents': [] });
    wrap(<YxDeskMyTicketPage />);
    await waitFor(() => expect(calls).toContain('GET /desk/my/requests/t1/documents'));
    expect(screen.queryByRole('button', { name: /Cancel this/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read and sign' })).toBeNull();
  });
});
