import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxNominationsPage from './(app)/performance/reviews/[id]/nominations/page';
import YxFeedbackPage from './(app)/performance/feedback/page';
import { OneOnOnesPage } from './(app)/performance/one-on-ones/one-on-ones-view';
import YxPipPage from './(app)/performance/pips/[id]/page';
import YxDisputeRaisePage from './(app)/performance/reviews/[id]/dispute/page';
import YxCoachPage from './(app)/performance/coach/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// PRF-07, 08, 11, 12, 15 and 16 pages: under 768 px they show the designed phone layout (as PRF-01, 02 and 06), over it
// the desktop one, and the phone layout still reaches the API (positive and negative).
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
const calls: { method: string; path: string; body: unknown }[] = [];
const serve = (routes: Record<string, unknown>) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path.startsWith('/rbac/me/permissions')) return [];
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, body });
    const key = `${method} ${path.split('?')[0]}`;
    if (!(key in routes)) throw new Error(`unexpected ${key}`);
    return routes[key];
  });
const realMatchMedia = window.matchMedia;
const width = (px: number) => {
  window.matchMedia = ((q: string) => ({ matches: px <= Number(/max-width: (\d+)px/.exec(q)?.[1] ?? 0), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
};
const phoneFrame = () => document.querySelector('.yx-phone');

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  width(375);
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'x1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const NOMS = {
  peer: { minNominees: 3, maxNominees: 6, dueOn: '2026-11-20' },
  nominations: [{ id: 'n1', reviewer: 'Sita', relationship: 'peer', status: 'proposed', proposedBy: 'employee' }],
  can: { propose: true, decide: false, add: false, send: true },
  employee: 'Arjun',
  manager: 'Priya',
  cycle: 'H2',
  sentAt: null,
  viewer: 'employee',
};

describe('PRF-07 nominations page', () => {
  it('phone: Send below the minimum says why and sends nothing', async () => {
    serve({ 'GET /performance/reviews/x1/nominations': NOMS, 'GET /performance/reviews/x1/nominee-options': [] });
    wrap(<YxNominationsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send to manager for approval' }));
    expect(phoneFrame()).not.toBeNull();
    expect(screen.getByText(/Nominate at least 3 reviewers/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('desktop over 768 px', async () => {
    width(1280);
    serve({ 'GET /performance/reviews/x1/nominations': NOMS, 'GET /performance/reviews/x1/nominee-options': [] });
    wrap(<YxNominationsPage />);
    expect(await screen.findByRole('heading', { name: 'Nominate your 360° reviewers' })).toBeInTheDocument();
    expect(phoneFrame()).toBeNull();
  });
});

const FEEDBACK = {
  'GET /people/me': { employeeId: 'e1' },
  'GET /people/team': { managerId: 'e3', members: [] },
  'GET /people/directory': { people: [{ id: 'e2', name: 'Sita' }] },
  'GET /performance/feedback-requests': { requests: [] },
  'GET /performance/feedback': { items: [{ id: 'f1', from: 'Sita', fromEmployeeId: 'e2', to: 'Arjun', toEmployeeId: 'e1', kind: 'praise', text: 'Thanks for the cover.', visibility: 'private', goalId: null, fromRequest: false, at: '2026-10-10T09:00:00.000Z', sealed: false, can: { withdraw: false, seal: false } }] },
};

describe('PRF-08 feedback page', () => {
  it('phone: give feedback opens the sheet; sending with nobody chosen says so', async () => {
    serve(FEEDBACK);
    wrap(<YxFeedbackPage />);
    expect(await screen.findByText('Thanks for the cover.')).toBeInTheDocument();
    expect(phoneFrame()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Give feedback' }));
    const sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send feedback' }));
    expect(within(sheet).getByText('Choose who the feedback is for.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('desktop over 768 px', async () => {
    width(1280);
    serve(FEEDBACK);
    wrap(<YxFeedbackPage />);
    expect(await screen.findByText('Thanks for the cover.')).toBeInTheDocument();
    expect(phoneFrame()).toBeNull();
  });
});

const ONE = { id: 'o1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', managerEmployeeId: 'e2', on: '2026-11-10', status: 'planned', cadenceDays: 14, lastHeldOn: null, agenda: [], sharedNotes: '', privateNote: '', actions: [], goals: [], version: 1 };
const ONES = {
  'GET /performance/one-on-ones': { pairs: [{ id: 'o1', employee: 'Arjun', manager: 'Priya', partnerRole: 'Direct report', role: 'manager', cadenceDays: 14, on: '2026-11-10', lastHeldOn: null, status: 'planned', agendaItems: 0, openActions: 0 }], partners: [], defaultCadenceDays: 14 },
  'GET /performance/one-on-ones/o1': ONE,
  'GET /performance/one-on-ones/o1/suggested-agenda': [{ id: 'goal:g1', text: 'Rejects: agree one next step', why: 'Goal is off track' }],
  'PUT /performance/one-on-ones/o1': { ...ONE, status: 'held' },
};

describe('PRF-11 and PRF-16 1:1 pages', () => {
  it('phone list: Open goes to the 1:1', async () => {
    serve(ONES);
    wrap(<OneOnOnesPage openId={null} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(phoneFrame()).not.toBeNull();
    expect(push).toHaveBeenCalledWith('/yx/performance/one-on-ones/o1');
  });

  it('phone record: suggested agenda shows, Mark as held saves, All 1:1s goes back', async () => {
    serve(ONES);
    wrap(<OneOnOnesPage openId="o1" />);
    expect(await screen.findByText('Rejects: agree one next step')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as held' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/performance/one-on-ones/o1', body: { status: 'held', version: 1 } }));
    await userEvent.click(screen.getByRole('button', { name: 'All 1:1s' }));
    expect(push).toHaveBeenCalledWith('/yx/performance/one-on-ones');
  });

  it('desktop over 768 px opens the record in a drawer', async () => {
    width(1280);
    serve(ONES);
    wrap(<OneOnOnesPage openId="o1" />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(phoneFrame()).toBeNull();
  });
});

const PIP = {
  id: 'x1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', reason: 'Accuracy fell.', expectations: 'Errors at most 2%.', support: 'Coaching.',
  startsOn: '2026-10-01', plannedEndsOn: '2026-10-31', endsOn: '2026-10-31', pausedDays: 0, pausedNow: false, checkinEveryDays: 7, status: 'active',
  acknowledgedAt: null, employeeComment: null, extendedFrom: null, extendReason: null, outcomeNote: null, outcomeAt: null, letterId: null, exitCaseId: null,
  goals: [], checkins: [{ id: 'c1', dueOn: '2026-10-08', heldOn: null, managerNote: null, employeeNote: null, status: 'due' }],
  warning: false, role: 'employee', can: { acknowledge: true, checkin: false, employeeNote: false, outcome: false, extend: false, letter: false, startExit: false }, version: 2,
  approval: { steps: [{ id: 'proposed', label: 'Proposed', status: 'done' }], canDecide: false }, extendDays: 30,
};

describe('PRF-12 PIP page', () => {
  it('phone: the employee acknowledges the plan', async () => {
    serve({ 'GET /performance/pips/x1': PIP, 'POST /performance/pips/x1/acknowledge': { ...PIP, acknowledgedAt: '2026-10-02T09:00:00.000Z' } });
    wrap(<YxPipPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge plan' }));
    expect(phoneFrame()).not.toBeNull();
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.path).toBe('/performance/pips/x1/acknowledge'));
  });

  it('desktop over 768 px', async () => {
    width(1280);
    serve({ 'GET /performance/pips/x1': PIP });
    wrap(<YxPipPage />);
    expect(await screen.findByText('Arjun')).toBeInTheDocument();
    expect(phoneFrame()).toBeNull();
  });
});

const MINE = { reviewId: 'x1', cycle: 'H1', score: 4, band: 'Meets', disagreement: { raisedOn: '2026-10-10', answeredOn: '2026-10-20', status: 'not_upheld', hrNote: 'x' }, escalateBy: '2026-11-04', canEscalate: true, why: null, dispute: null, steps: [] };

describe('PRF-15 escalation page', () => {
  it('phone: too short says so; then it is raised', async () => {
    serve({ 'GET /performance/reviews/x1/dispute': MINE, 'POST /performance/reviews/x1/dispute': { ...MINE, dispute: { id: 'd1', ref: 'PRF-D-0001', status: 'raised', raisedOn: '2026-11-03', decision: null, decisionNote: null, files: [] } } });
    wrap(<YxDisputeRaisePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Escalate dispute' }));
    expect(phoneFrame()).not.toBeNull();
    expect(screen.getByText('Say what you are escalating and why, in at least 20 characters.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.type(screen.getByRole('textbox', { name: /What are you escalating/ }), 'The supplier strike caused the delay on goal 2.');
    await userEvent.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.path).toBe('/performance/reviews/x1/dispute'));
  });

  it('desktop over 768 px', async () => {
    width(1280);
    serve({ 'GET /performance/reviews/x1/dispute': MINE });
    wrap(<YxDisputeRaisePage />);
    expect(await screen.findByRole('heading', { name: 'Escalate a rating dispute' })).toBeInTheDocument();
    expect(phoneFrame()).toBeNull();
  });
});

const COACH = { state: 'ready', weekOf: '2026-11-02', firstName: 'Priya', optedOut: false, looksAt: ['Goals off track or at risk'], nudges: [{ id: 'e1:1on1', person: 'Divya R', signal: '1:1 overdue by 9 days.', action: 'Book 1:1', link: '/yx/performance/one-on-ones' }] };

describe('PRF-16 coach page', () => {
  it('phone: dismissing goes to the API', async () => {
    serve({ 'GET /performance/coach': COACH, 'POST /performance/coach/dismiss': { ...COACH, nudges: [] } });
    wrap(<YxCoachPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss nudge about Divya R' }));
    expect(phoneFrame()).not.toBeNull();
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ key: 'e1:1on1' }));
  });

  it('phone: acting opens the link', async () => {
    serve({ 'GET /performance/coach': COACH });
    wrap(<YxCoachPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Book 1:1' }));
    expect(push).toHaveBeenCalledWith('/yx/performance/one-on-ones');
  });

  it('desktop over 768 px', async () => {
    width(1280);
    serve({ 'GET /performance/coach': COACH });
    wrap(<YxCoachPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Book 1:1' }));
    expect(phoneFrame()).toBeNull();
    expect(push).toHaveBeenCalledWith('/yx/performance/one-on-ones');
  });
});
