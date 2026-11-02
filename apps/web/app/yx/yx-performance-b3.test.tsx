import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHandoversPage from './(app)/performance/handovers/page';
import YxCompetenciesPage from './(app)/performance/competencies/page';
import YxDisputesPage from './(app)/performance/disputes/page';
import YxDisputePage from './(app)/performance/disputes/[id]/page';
import YxDisputeRaisePage from './(app)/performance/reviews/[id]/dispute/page';
import YxCoachPage from './(app)/performance/coach/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Performance builder 3 pages wired to /performance: PRF-13 hand-overs, PRF-14 competencies, PRF-15 disputes, PRF-16 coach.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();
type Route = Record<string, unknown | ((body: unknown) => unknown)>;
const calls: { method: string; path: string; body: unknown }[] = [];
/** Answers GET and writes from a table ("GET /x", "POST /y"); anything else is a test failure. */
const serve = (routes: Route, perms: string[] = []) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path.startsWith('/rbac/me/permissions')) return perms;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`unexpected ${key}`);
    const r = routes[key];
    return typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
  });

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'x1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const HANDOVER = { id: 'h2', employee: 'Sana N', employeeId: 'e2', artefact: 'Goal parent', artefactType: 'goal_parent', artefactId: 'g9', detail: '“LIMS” was aligned to the old manager’s goal', from: 'Priya', to: 'Karthik', effectiveOn: '2026-11-01', status: 'Needs decision', decision: null, note: null };

describe('PRF-13 hand-over list page', () => {
  it('a manager sees what came to them and re-aligns a goal', async () => {
    serve({ 'GET /performance/handover-list': [HANDOVER], 'GET /performance/handover-list/h2/parent-options': [{ value: 'g1', label: 'Zero line stops' }], 'POST /performance/handover-list/h2/decide': { ...HANDOVER, status: 'Decided' } });
    wrap(<YxHandoversPage />);
    expect(await screen.findByText('Handed over to you')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Re-parent goal' }));
    const d = screen.getByRole('dialog');
    await userEvent.click(await within(d).findByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Zero line stops' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/performance/handover-list/h2/decide', body: { decision: 'realigned', parentGoalId: 'g1' } }));
  });

  it('HR reads the company list', async () => {
    serve({ 'GET /performance/handover-list/all': [] }, ['perf.cycle.manage']);
    wrap(<YxHandoversPage />);
    expect(await screen.findByText('Hand-over list')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === '/performance/handover-list/all')).toBe(true));
  });
});

describe('PRF-14 competencies page', () => {
  it('maps a role through the competency save, with today and the version', async () => {
    const comp = { id: 'k1', skillId: 's1', name: 'Food safety', group: 'functional', description: 'HACCP', status: 'active', starter: true, levels: [{ level: 1, label: 'Aware', behaviours: 'knows the rules' }, { level: 2, label: 'Applies', behaviours: null }], roles: [], usedIn: ['Annual'], version: 4 };
    serve({ 'GET /performance/competencies': [comp], 'GET /org/masters/designations': [{ id: 'd1', name: 'QA Engineer', archivedAt: null }], 'PUT /performance/competencies/k1': (b) => ({ ...comp, ...(b as object), group: 'functional', levels: comp.levels, roles: [] }) }, ['perf.setup.manage', 'org.structure.view']);
    wrap(<YxCompetenciesPage />);
    expect(await screen.findByText('Aware: knows the rules')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Map a role' }));
    const d = screen.getByRole('dialog');
    await userEvent.click(within(d).getAllByRole('combobox')[0]);
    await userEvent.click(await screen.findByRole('option', { name: 'QA Engineer' }));
    await userEvent.click(within(d).getAllByRole('combobox')[1]);
    await userEvent.click(await screen.findByRole('option', { name: /Level 2/ }));
    await userEvent.click(within(d).getByRole('button', { name: 'Map role' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual(expect.objectContaining({ group: 'functional', levels: [{ label: 'Aware', behaviours: 'knows the rules' }, { label: 'Applies', behaviours: null }], roles: [{ designationId: 'd1', level: 2, validFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }], version: 4 })));
  });
});

const RECORD = {
  id: 'x1', ref: 'PRF-D-0001', reviewId: 'r1', employee: 'Divya R', cycle: 'H1', score: 4, band: 'Meets', raisedOn: '2026-11-01', status: 'raised', legalHold: false, grounds: 'Strike', sought: 'A fresh review', decision: null, decisionNote: null,
  steps: [{ id: 'escalated', label: 'Escalated', status: 'done', at: '2026-11-01T05:00:00.000Z' }],
  evidence: [{ id: 'review', kind: 'Review as released', label: 'Final 4', at: '2026-11-01T05:00:00.000Z', hash: 'b'.repeat(64) }],
  activity: [{ id: 'a1', actor: 'Divya R', action: 'escalated the dispute', at: '2026-11-01T05:00:00.000Z' }],
  exports: [], signatories: [{ value: 'u1', label: 'Legal' }], version: 2,
};

describe('PRF-15 dispute pages', () => {
  it('the list opens a case', async () => {
    serve({ 'GET /performance/disputes': [{ id: 'x1', ref: 'PRF-D-0001', employee: 'Divya R', cycle: 'H1', raisedOn: '2026-11-01', status: 'raised', legalHold: true }] }, ['perf.dispute.manage']);
    wrap(<YxDisputesPage />);
    await userEvent.click(await screen.findByText('Divya R'));
    expect(push).toHaveBeenCalledWith('/yx/performance/disputes/x1');
  });

  it('the record puts the legal hold on with the version and exports then downloads', async () => {
    (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['%PDF-']), filename: 'PRF-D-0001-EXP-01.pdf' });
    (globalThis.URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    serve({ 'GET /performance/disputes/x1': RECORD, 'POST /performance/disputes/x1/legal-hold': { ...RECORD, legalHold: true }, 'POST /performance/disputes/x1/export': { exportId: 'e1', ref: 'PRF-D-0001-EXP-01' } }, ['perf.dispute.manage']);
    wrap(<YxDisputePage />);
    await userEvent.click(await screen.findByRole('switch', { name: /Legal hold/ }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/legal-hold'))?.body).toEqual({ on: true, version: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Export evidence' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Export evidence' }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/export'))?.body).toEqual({ items: ['review'], signatoryUserId: 'u1' }));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalledWith('/performance/disputes/x1/exports/e1/file', {}, 'tok'));
  });

  it('the employee escalates their review', async () => {
    const mine = { reviewId: 'x1', cycle: 'H1', score: 4, band: 'Meets', disagreement: { raisedOn: '2026-10-10', answeredOn: '2026-10-20', status: 'not_upheld', hrNote: 'x' }, escalateBy: '2026-11-04', canEscalate: true, why: null, dispute: null, steps: [] };
    serve({ 'GET /performance/reviews/x1/dispute': mine, 'POST /performance/reviews/x1/dispute': { ...mine, dispute: { id: 'd1', ref: 'PRF-D-0001', status: 'raised', raisedOn: '2026-11-03', decision: null, decisionNote: null, files: [] } } });
    wrap(<YxDisputeRaisePage />);
    await userEvent.type(await screen.findByRole('textbox', { name: /What are you escalating/ }), 'The supplier strike caused the delay on goal 2.');
    await userEvent.click(screen.getByRole('button', { name: 'Escalate dispute' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/performance/reviews/x1/dispute', body: { grounds: 'The supplier strike caused the delay on goal 2.', sought: 'rereview' } }));
  });

  it('the employee who may not escalate yet is told why', async () => {
    serve({ 'GET /performance/reviews/x1/dispute': { reviewId: 'x1', cycle: 'H1', score: 4, band: 'Meets', disagreement: null, escalateBy: null, canEscalate: false, why: 'Raise a disagreement on the review first. You can escalate once HR has answered it.', dispute: null, steps: [] } });
    wrap(<YxDisputeRaisePage />);
    expect((await screen.findAllByText(/Raise a disagreement on the review first/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Escalate dispute' })).toBeNull();
  });
});

describe('PRF-16 coach page', () => {
  it('acting opens the link; dismissing and opting out go to the API', async () => {
    const coach = { state: 'ready', weekOf: '2026-11-02', firstName: 'Priya', optedOut: false, looksAt: ['Goals off track or at risk'], nudges: [{ id: 'e1:1on1', person: 'Divya R', signal: '1:1 overdue by 9 days.', action: 'Book 1:1', link: '/yx/performance/one-on-ones' }] };
    serve({ 'GET /performance/coach': coach, 'POST /performance/coach/dismiss': { ...coach, nudges: [] }, 'POST /performance/coach/opt-out': { ...coach, optedOut: true, nudges: [] } });
    wrap(<YxCoachPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Book 1:1' }));
    expect(push).toHaveBeenCalledWith('/yx/performance/one-on-ones');
    await userEvent.click(screen.getByRole('link', { name: 'Turn off coach nudges' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/performance/coach/opt-out')?.body).toEqual({ optedOut: true }));
  });

  it('someone without a team is told the coach is for managers', async () => {
    serve({ 'GET /performance/coach': { state: 'not-manager', weekOf: '2026-11-02', firstName: 'Divya', optedOut: false, looksAt: [], nudges: [] } });
    wrap(<YxCoachPage />);
    expect(await screen.findByText('No team yet')).toBeInTheDocument();
  });
});
