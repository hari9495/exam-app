import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxFeedbackPage from './(app)/performance/feedback/page';
import YxOneOnOnePage from './(app)/performance/one-on-ones/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// PRF-08 Quick feedback and PRF-11 1:1s: the designed screens wired to /performance (M06 batch PM3; builder 2).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/feedback');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Feedback and 1:1s (M06 batch PM3)', () => {
  it('received feedback loads; a sealed item shows as removed; the form links to the concern channel', async () => {
    route({
      'GET /rbac/me/permissions': [],
      'GET /people/me': { employeeId: 'e1' },
      'GET /people/team': { managerId: 'e3', members: [] },
      'GET /people/directory': { people: [{ id: 'e1', name: 'Arjun' }, { id: 'e2', name: 'Sita' }] },
      'GET /performance/feedback-requests': { requests: [] },
      'GET /performance/feedback': {
        items: [
          { id: 'f1', from: 'Sita', fromEmployeeId: 'e2', to: 'Arjun', toEmployeeId: 'e1', kind: 'praise', text: 'Thanks for the cover.', visibility: 'private', goalId: null, fromRequest: false, at: '2026-10-10T09:00:00.000Z', sealed: false, can: { withdraw: false, seal: false } },
          { id: 'f2', from: 'Sita', fromEmployeeId: 'e2', to: 'Arjun', toEmployeeId: 'e1', kind: 'suggestion', text: null, visibility: 'private', goalId: null, fromRequest: false, at: '2026-10-11T09:00:00.000Z', sealed: true, can: { withdraw: false, seal: false } },
        ],
      },
    });
    wrap(<YxFeedbackPage />);
    expect(await screen.findByText('Thanks for the cover.')).toBeInTheDocument();
    expect(screen.getAllByText('Removed by HR').length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Give feedback' })[0]!);
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Report a concern' })).toHaveAttribute('href', '/yx/desk/help');
  });

  it('the colleague picker searches the directory on the server, 25 at a time, with no cap', async () => {
    const asked: string[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /people/me': { employeeId: 'e1' },
      'GET /people/team': { managerId: 'e3', members: [] },
      'GET /people/directory': (p: string) => (asked.push(p), { people: p.includes('q=Meen') ? [{ id: 'e250', name: 'Meena Pillai', designation: { name: 'Buyer' }, department: null }] : [] }),
      'GET /performance/feedback-requests': { requests: [] },
      'GET /performance/feedback': { items: [] },
    });
    wrap(<YxFeedbackPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Give feedback' }))[0]!);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: /^To/ }));
    await userEvent.type(screen.getByPlaceholderText('Name, email, role or department'), 'Meen');
    expect(await screen.findByRole('option', { name: /Meena Pillai/ })).toBeInTheDocument();
    expect(asked[0]).toBe('/people/directory?limit=25');
    expect(asked).toContain('/people/directory?limit=25&q=Meen');
  });

  it('a 1:1 opens in the drawer of the list and saves the private note to its own route when you leave the box', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'm1' });
    const put: unknown[] = [];
    const meeting = { id: 'm1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', managerEmployeeId: 'e3', role: 'employee', on: '2026-12-13', status: 'planned', sharedNotes: null, agenda: [], actions: [], privateNote: '', cadenceDays: 14, lastHeldOn: null, goals: [], version: 1 };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/one-on-ones': { pairs: [{ id: 'm1', role: 'employee', employee: 'Arjun', manager: 'Priya', partnerRole: 'Area Manager', on: '2026-12-13', status: 'planned', lastHeldOn: null, cadenceDays: 14, agendaItems: 0, openActions: 0 }], partners: [{ value: 'e3', label: 'Priya (my manager)' }], defaultCadenceDays: 14 },
      'GET /performance/one-on-ones/m1': meeting,
      'PUT /performance/one-on-ones/m1/private-note': (_p: string, init: RequestInit) => (put.push(JSON.parse(String(init.body))), meeting),
    });
    wrap(<YxOneOnOnePage />);
    const note = await screen.findByRole('textbox', { name: 'My private notes' });
    await userEvent.type(note, 'Ask about the course.');
    fireEvent.blur(note);
    await waitFor(() => expect(put).toEqual([{ text: 'Ask about the course.' }]));
  });

  it('T2-C item 70: a planned 1:1 starts its agenda from a template; the manager saves the agenda as their own; the employee cannot', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'm1' });
    const posted: [string, unknown][] = [];
    const meeting = { id: 'm1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', managerEmployeeId: 'e3', role: 'manager', on: '2026-12-13', status: 'planned', sharedNotes: null, agenda: [{ id: 'i1', text: 'Wins', done: false, addedBy: 'Priya' }], actions: [], privateNote: '', cadenceDays: 14, lastHeldOn: null, goals: [], version: 1 };
    const pairs = (role: string) => ({ pairs: [{ id: 'm1', role, employee: 'Arjun', manager: 'Priya', partnerRole: 'Executive', on: '2026-12-13', status: 'planned', lastHeldOn: null, cadenceDays: 14, agendaItems: 1, openActions: 0 }], partners: [], defaultCadenceDays: 14 });
    const post = (path: string) => (_p: string, init: RequestInit) => (posted.push([path, JSON.parse(String(init.body))]), meeting);
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/one-on-ones': pairs('manager'),
      'GET /performance/one-on-ones/m1': meeting,
      'GET /performance/one-on-ones/m1/suggested-agenda': [],
      'GET /performance/one-on-one-templates': [{ id: 't1', name: 'Weekly check-in', items: ['Wins', 'Blockers'], company: true, mine: false, updatedAt: '2026-11-27T10:00:00Z' }],
      'POST /performance/one-on-ones/m1/agenda/from-template': post('use'),
      'POST /performance/one-on-one-templates': post('save'),
    });
    const first = wrap(<YxOneOnOnePage />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Agenda template' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Weekly check-in (company)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use template' }));
    await waitFor(() => expect(posted).toEqual([['use', { templateId: 't1' }]]));
    await userEvent.click(screen.getByRole('button', { name: 'Save agenda as my template' }));
    await userEvent.type(within(screen.getByRole('dialog', { name: 'Save as my 1:1 template' })).getByRole('textbox', { name: /Template name/ }), 'Fortnightly');
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(posted[1]).toEqual(['save', { name: 'Fortnightly', items: ['Wins'] }]));
    first.unmount();
    // Negative: the employee may pick a template but has no Save as my template.
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/one-on-ones': pairs('employee'),
      'GET /performance/one-on-ones/m1': { ...meeting, role: 'employee' },
      'GET /performance/one-on-ones/m1/suggested-agenda': [],
      'GET /performance/one-on-one-templates': [{ id: 't1', name: 'Weekly check-in', items: ['Wins'], company: true, mine: false, updatedAt: '2026-11-27T10:00:00Z' }],
    });
    wrap(<YxOneOnOnePage />);
    expect(await screen.findByRole('combobox', { name: 'Agenda template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save agenda as my template' })).toBeNull();
  });
});
