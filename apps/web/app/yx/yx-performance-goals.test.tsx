import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPerformanceHomePage from './(app)/performance/page';
import YxMyGoalsPage from './(app)/performance/goals/page';
import YxGoalMapPage from './(app)/performance/goal-map/page';
import YxReviewsPage from './(app)/performance/reviews/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// PRF-01 home, PRF-02 my goals and PRF-03 goal map: the designed screens wired to /performance (performance builder 1).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
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
  (usePathname as jest.Mock).mockReturnValue('/yx/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({});
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const PERIODS = [{ id: 'p0', name: 'H1', fromOn: '2026-04-01', toOn: '2026-09-30', status: 'closed' }, { id: 'p1', name: 'H2 FY 2026-27', fromOn: '2026-10-01', toOn: '2027-03-31', status: 'open' }];
const KR = { id: 'k1', title: 'Accounts', unit: null, direction: 'up', start: 0, target: 3, current: 1, weight: 1, progress: 33.33 };
const GOAL = { id: 'g1', periodId: 'p1', ownerType: 'person', ownerEmployeeId: 'e1', ownerDepartmentId: null, owner: 'Arjun Rao', parentGoalId: null, kind: 'okr', title: 'Close three new accounts', weight: 100, status: 'draft', progress: 33.33, version: 1, keyResults: [KR], confidence: null, lastCheckIn: null };
const HOME = { persona: 'emp', name: 'Arjun', period: PERIODS[1], actions: [{ id: 'a1', type: 'Review', title: 'Your self review · FY annual', who: 'Arjun', due: '2026-11-10', href: '/yx/performance/reviews/r1', actionLabel: 'Start' }], myGoals: [{ ...GOAL, status: 'active' }], myReview: { id: 'r1', cycle: 'FY annual', status: 'open', stage: 'self', next: { stage: 'self', label: 'Self review', owner: 'Arjun Rao', dueOn: '2026-11-10' }, employee: 'Arjun Rao', manager: 'Priya Nair', stages: [{ key: 'self', dueOn: '2026-11-10' }, { key: 'manager', dueOn: '2026-11-20' }] }, feedback: [], nextOneOnOne: null, team: [], teamGoals: [], hr: null };

describe('PRF-01 … 03 live (performance builder 1)', () => {
  it('the home shows what needs the employee, their review stages, and a check-in saves with a toast', async () => {
    const posted: unknown[] = [];
    route({ 'GET /rbac/me/permissions': [], 'GET /performance/home': HOME, 'POST /performance/goals/g1/checkins': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}) });
    wrap(<YxPerformanceHomePage />);
    expect(await screen.findByText('Your self review · FY annual')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Review stages' })).toHaveTextContent('Self review');
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(posted).toEqual([{ values: [{ keyResultId: 'k1', value: 1 }], confidence: 'on_track', note: null }]));
    expect(await screen.findByText('Check-in saved')).toBeInTheDocument();
  });

  it('the home error offers Retry', async () => {
    route({ 'GET /rbac/me/permissions': [] });
    wrap(<YxPerformanceHomePage />);
    expect(await screen.findByRole('button', { name: /Retry|Try again/ })).toBeInTheDocument();
  });

  it('my goals: the drafts go to the manager together, from the open period', async () => {
    const seen: string[] = [];
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /people/team': { managerId: null, members: [] },
      'GET /performance/goal-periods': PERIODS,
      'GET /performance/goals': (p: string) => (seen.push(p), p.includes('view=company') ? { goals: [], totalWeight: null, canDecide: false } : { goals: [GOAL], totalWeight: 100, canDecide: false }),
      'GET /performance/goals/align-options': [],
      'POST /performance/goals/submit': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxMyGoalsPage />);
    expect(await screen.findByText('Close three new accounts')).toBeInTheDocument();
    expect(seen).toContain('/performance/goals?period=p1&view=mine');
    await userEvent.click(screen.getByRole('button', { name: 'Send to my manager' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(posted).toEqual([{ periodId: 'p1' }]));
  });

  it('T2-C 71: a goal starts from a template; the goal-setting key imports a CSV after a preview; without the key there is no import', async () => {
    const posted: unknown[] = [];
    const base = {
      'GET /people/team': { managerId: null, members: [] },
      'GET /performance/goal-periods': PERIODS,
      'GET /performance/goals': (p: string) => (p.includes('view=company') ? { goals: [], totalWeight: null, canDecide: false } : { goals: [GOAL], totalWeight: 100, canDecide: false }),
      'GET /performance/goals/align-options': [],
      'GET /performance/goal-templates': [{ id: 't1', title: 'Learn one new skill', description: null, kind: 'kpi', keyResults: [], departmentId: null, department: null, designationId: null, designation: null }],
    };
    route({ ...base, 'GET /rbac/me/permissions': ['perf.goal.manage'], 'POST /performance/goals/import': (_p: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      posted.push(body);
      return body.preview ? { preview: true, rows: [{ line: 2, employee: 'Arjun', employeeCode: 'KF-3', title: 'Goal one', weight: 10 }], problems: [] } : { imported: 1 };
    } });
    const first = wrap(<YxMyGoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add goal' }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Start from a template' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Learn one new skill' }));
    expect(screen.getByDisplayValue('Learn one new skill')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Start from a template' })).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Import goals' }));
    // jsdom's File has no text(); the browser's does.
    if (!File.prototype.text) File.prototype.text = function (this: File) { return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(this); }); };
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['employee_code,title\nKF-3,Goal one'], 'goals.csv', { type: 'text/csv' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Import 1 goal' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[0]).toMatchObject({ preview: true });
    expect(posted[1]).not.toHaveProperty('preview');
    first.unmount();
    route({ ...base, 'GET /rbac/me/permissions': [] });
    wrap(<YxMyGoalsPage />);
    expect(await screen.findByRole('button', { name: 'Add goal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import goals' })).toBeNull();
  });

  it('the manager sends a report’s goals back only with what to change, then approves', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('employee=e1'));
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /people/team': { managerId: null, members: [{ id: 'e1', name: 'Arjun Rao', relation: 'direct' }] },
      'GET /performance/goal-periods': PERIODS,
      'GET /performance/goals': (p: string) => (p.includes('view=company') ? { goals: [], totalWeight: null, canDecide: false } : { goals: [{ ...GOAL, status: 'submitted' }], totalWeight: 100, canDecide: true }),
      'GET /performance/goals/align-options': [],
      'POST /performance/goals/decide': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxMyGoalsPage />);
    expect(await screen.findByText('Arjun Rao’s goals')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Send back' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(within(dialog).getByText('Enter at least 3 characters.')).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.type(within(dialog).getByRole('textbox'), 'Add a repeat-order target');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(posted).toEqual([{ employeeId: 'e1', periodId: 'p1', decision: 'send_back', reason: 'Add a repeat-order target' }]));
    await userEvent.click(screen.getByRole('button', { name: 'Approve goals' }));
    await waitFor(() => expect(posted[1]).toEqual({ employeeId: 'e1', periodId: 'p1', decision: 'approve' }));
  });

  it('the goal map: HR suggests a parent for an unaligned goal', async () => {
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': ['perf.goal.view', 'perf.goal.manage'],
      'GET /org/masters/departments': [],
      'GET /performance/goal-periods': PERIODS,
      'GET /performance/goal-map': { goals: [{ ...GOAL, status: 'active' }, { ...GOAL, id: 'c1', ownerType: 'company', ownerEmployeeId: null, owner: 'Company', title: 'Grow revenue 20%', weight: 0 }], unaligned: ['g1'], offTrack: [] },
      'GET /performance/goals/align-options': [],
      'POST /performance/goals/g1/suggest-parent': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), {}),
    });
    wrap(<YxGoalMapPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest parent' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send suggestion' }));
    expect(within(dialog).getByText('Choose one.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Align it to' }));
    await userEvent.click(await screen.findByRole('option', { name: /Grow revenue 20%/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(posted).toEqual([{ parentGoalId: 'c1' }]));
  });

  it('a manager’s home shows the coach card from GET /performance/coach (founder 3 Nov 2026)', async () => {
    const seen: string[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/home': { ...HOME, persona: 'mgr', team: [{ id: 'e1', name: 'Arjun Rao', role: 'Executive', goalProgress: 33, reviewStage: 'Self review', reviewId: 'r1', lastOneOnOne: null, lastFeedback: null }] },
      'GET /performance/coach': (p: string) => (seen.push(p), { state: 'ready', weekOf: '2026-11-02', firstName: 'Priya', optedOut: false, looksAt: [], nudges: [{ id: 'n1', person: 'Arjun Rao', signal: 'No feedback given in 6 weeks', action: 'Give feedback', link: '/yx/performance/feedback' }] }),
    });
    wrap(<YxPerformanceHomePage />);
    expect(await screen.findByText('No feedback given in 6 weeks')).toBeInTheDocument();
    expect(seen).toEqual(['/performance/coach']);
  });

  it('an employee’s home does not ask for the coach', async () => {
    const seen: string[] = [];
    route({ 'GET /rbac/me/permissions': [], 'GET /performance/home': HOME, 'GET /performance/coach': (p: string) => (seen.push(p), {}) });
    wrap(<YxPerformanceHomePage />);
    expect(await screen.findByText('Your self review · FY annual')).toBeInTheDocument();
    expect(seen).toEqual([]);
  });

  it('the old reviews list sends people to the home (T2-F 82: through the moved-page stub)', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T06:00:00Z'), doNotFake: ['queueMicrotask'] });
    try {
      const replace = jest.fn();
      (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
      wrap(<YxReviewsPage />);
      expect(screen.getByText('This page has moved')).toBeInTheDocument();
      act(() => jest.advanceTimersByTime(5000));
      expect(replace).toHaveBeenCalledWith('/yx/performance');
    } finally {
      jest.useRealTimers();
    }
  });
});
