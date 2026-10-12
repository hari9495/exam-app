import { render, screen, waitFor, within } from '@testing-library/react';
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

// Feedback and 1:1s wired to /performance (M06 batch PM3, PM-3.04).
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
    await userEvent.click(screen.getByRole('button', { name: 'Give feedback' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Report a concern instead' })).toHaveAttribute('href', '/yx/desk/help');
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
    await userEvent.click(await screen.findByRole('button', { name: 'Give feedback' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'For' }));
    await userEvent.type(screen.getByPlaceholderText('Name, email, role or department'), 'Meen');
    expect(await screen.findByRole('option', { name: /Meena Pillai/ })).toBeInTheDocument();
    expect(asked[0]).toBe('/people/directory?limit=25');
    expect(asked).toContain('/people/directory?limit=25&q=Meen');
  });

  it('a 1:1 saves the private note to its own route', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'm1' });
    const put: unknown[] = [];
    const meeting = { id: 'm1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', managerEmployeeId: 'e3', role: 'employee', on: '2026-10-13', status: 'planned', sharedNotes: null, agenda: [], actions: [], privateNote: '', version: 1 };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/one-on-ones/m1': meeting,
      'PUT /performance/one-on-ones/m1/private-note': (_p: string, init: RequestInit) => (put.push(JSON.parse(String(init.body))), meeting),
    });
    wrap(<YxOneOnOnePage />);
    await userEvent.type(await screen.findByRole('textbox', { name: /Only you/ }), 'Ask about the course.');
    await userEvent.click(screen.getByRole('button', { name: 'Save my note' }));
    await waitFor(() => expect(put).toEqual([{ text: 'Ask about the course.' }]));
  });
});
