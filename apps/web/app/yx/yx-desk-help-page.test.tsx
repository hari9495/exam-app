import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskHelpPage from './(app)/desk/help/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Help centre: the designed HLP-01 screen with `live` (Helpdesk design wiring, round 1).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const DESK = { id: 'd1', name: 'IT help desk', key: 'IT', attachmentTypes: ['pdf'], attachmentMaxMb: 10, types: [], categories: [{ id: 'c1', name: 'Laptop', parentId: null, sensitive: false }] };
const TICKET = { id: 't1', number: 'IT-1001', subject: 'VPN keeps dropping', desk: 'IT help desk', status: 'In progress', systemState: 'open', private: false, role: 'requester', createdAt: '2026-11-01T04:30:00Z', updatedAt: '2026-11-01T04:30:00Z', clock: { usedMinutes: 60, targetMinutes: 480, paused: false }, resolvedAt: null, closedAt: null, closesOn: null, reopenUntil: null, rating: null, canRate: false };
const BASE = {
  'GET /desk/my/kb': { spaces: [], featured: [], articles: [] },
  'GET /desk/my/privacy-requests': [],
  'GET /desk/my/desks': [DESK],
  'GET /desk/my/tickets': [TICKET],
  'GET /desk/my/banners': [],
  'GET /desk/my/chat/prompt': null,
  'GET /desk/my/messaging': { devTransport: false, lines: [] },
};

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Help centre (HLP-01 live)', () => {
  it('shows my tickets with the resolution promise and opens one', async () => {
    route(BASE);
    wrap(<YxDeskHelpPage />);
    expect(await screen.findByText(/Resolve: 7 h left/)).toBeInTheDocument();
    expect(screen.getByText('No help articles yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'VPN keeps dropping' }));
    expect(push).toHaveBeenCalledWith('/yx/desk/help/t1');
  });

  it('raises a ticket to the topic’s team and says its number', async () => {
    const posted: unknown[] = [];
    route({ ...BASE, 'POST /desk/my/tickets': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { id: 'n1', number: 'IT-1002' }) });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('new=1'));
    wrap(<YxDeskHelpPage />);
    await userEvent.click(await screen.findByRole('combobox', { name: /What is it about/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Laptop/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Subject/ }), 'Battery');
    await userEvent.type(screen.getByRole('textbox', { name: /Details/ }), 'Drains in an hour');
    await userEvent.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(posted).toEqual([{ deskId: 'd1', categoryId: 'c1', subject: 'Battery', description: 'Drains in an hour', impact: 3, urgency: 3 }]));
    expect((await screen.findAllByText(/Your ticket number is IT-1002/))[0]).toBeInTheDocument();
  });

  it('a 403 (acting for someone else) shows the no-access state, not "check your connection"', async () => {
    route({ ...BASE, 'GET /desk/my/tickets': () => Promise.reject(Object.assign(new Error('Not available while acting for someone else'), { status: 403 })) });
    wrap(<YxDeskHelpPage />);
    expect(await screen.findByText(/You don't have access to the Help centre/)).toBeInTheDocument();
  });
  it('1846: "On behalf of someone" searches only the people one may raise for', async () => {
    const asked: string[] = [];
    route({
      ...BASE,
      'GET /rbac/me/permissions': ['request.raise_on_behalf'],
      'GET /desk/my/pick/on-behalf': (p: string) => (asked.push(p), [{ id: 'p-ravi', label: 'Ravi Kumar', detail: 'Ops' }]),
    });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('new=1'));
    wrap(<YxDeskHelpPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'On behalf of someone' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Colleague' }));
    expect(await screen.findByRole('option', { name: /Ravi Kumar/ })).toBeInTheDocument();
    expect(asked[0]).toMatch(/^\/desk\/my\/pick\/on-behalf\?q=/);
    expect(api.mock.calls.some(([p]) => String(p).startsWith('/desk/my/pick/people'))).toBe(false);
  });

  it('1846 negative: without the right there is no "On behalf of someone" and nothing is searched', async () => {
    route({ ...BASE, 'GET /rbac/me/permissions': [] });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('new=1'));
    wrap(<YxDeskHelpPage />);
    expect(await screen.findByRole('textbox', { name: /Subject/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'On behalf of someone' })).toBeNull();
    expect(api.mock.calls.some(([p]) => String(p).includes('/desk/my/pick/'))).toBe(false);
  });
  it('1911: a facilities desk asks where it is; the areas asked for are those of the chosen building', async () => {
    const asked: string[] = [];
    route({
      ...BASE,
      'GET /desk/my/desks': [{ ...DESK, id: 'd-fac', name: 'Facilities', categories: [], askPlace: true }],
      'GET /desk/my/pick/locations': (p: string) => (asked.push(p), [{ id: 'l-blr', label: 'Bengaluru office', detail: 'BLR' }]),
      'GET /desk/my/pick/areas': (p: string) => (asked.push(p), [{ id: 'a-2', label: '2nd floor', detail: null }]),
    });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('new=1'));
    wrap(<YxDeskHelpPage />);
    await userEvent.click(await screen.findByRole('combobox', { name: /What is it about/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Facilities/ }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Building' }));
    await userEvent.click(await screen.findByRole('option', { name: /Bengaluru office/ }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Floor or area' }));
    expect(await screen.findByRole('option', { name: /2nd floor/ })).toBeInTheDocument();
    expect(asked.find((p) => p.startsWith('/desk/my/pick/areas'))).toMatch(/locationId=l-blr/);
  });
});
