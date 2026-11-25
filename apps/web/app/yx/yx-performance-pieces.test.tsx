import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHandoversPage from './(app)/performance/handovers/page';
import YxCompetenciesPage from './(app)/performance/competencies/page';
import YxReviewPage from './(app)/performance/reviews/[id]/page';
import YxPipPage from './(app)/performance/pips/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// The "live, gap" pieces of 3 Nov 2026 wired to /performance: PRF-05/06 download, PRF-12 extend after "not met",
// PRF-13 reassign to HR and the audit entry, PRF-14 import and skills test.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
type Route = Record<string, unknown | ((body: unknown) => unknown)>;
const calls: { method: string; path: string; body: unknown }[] = [];
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

// jsdom here has no File.text(); browsers do.
if (!File.prototype.text) File.prototype.text = function (this: File) { return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(this); }); };

beforeEach(() => {
  api.mockReset();
  (apiFetchBlob as jest.Mock).mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'x1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const HANDOVER = { id: 'h2', employee: 'Sana N', employeeId: 'e2', artefact: 'Goal parent', artefactType: 'goal_parent', artefactId: 'g9', detail: '“LIMS” was aligned to the old manager’s goal', from: 'Priya', to: 'Karthik', withHr: false, effectiveOn: '2026-11-01', status: 'Needs decision', decision: null, note: null };

describe('PRF-13 reassign to HR and the audit entry', () => {
  it('HR moves an open decision to HR and reads its audit entry', async () => {
    serve(
      {
        'GET /performance/handover-list/all': [HANDOVER],
        'POST /performance/handover-list/with-hr': { moved: 1, skipped: [] },
        'GET /performance/handover-list/h2/audit': [{ id: 'a1', at: '2026-11-01T04:00:00.000Z', who: null, what: 'moved the goal parent of Sana N from Priya to Karthik when the manager changed' }],
      },
      ['perf.cycle.manage'],
    );
    wrap(<YxHandoversPage />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Select all/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Reassign to HR' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reassign to HR' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/performance/handover-list/with-hr', body: { ids: ['h2'] } }));
    const row = (await screen.findAllByRole('row')).find((r) => within(r).queryByText('Sana N'))!;
    await userEvent.click(within(row).getByRole('button', { name: /More|Actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'View audit entry' }));
    expect(await screen.findByText(/when the manager changed/)).toBeInTheDocument();
  });

  it('a manager gets neither', async () => {
    serve({ 'GET /performance/handover-list': [HANDOVER] });
    wrap(<YxHandoversPage />);
    expect(await screen.findByText('Handed over to you')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Select all/i })).toBeNull();
  });
});

const COMP = { id: 'k1', skillId: 's1', name: 'Food safety', group: 'functional', description: 'HACCP', status: 'active', starter: false, levels: [{ level: 1, label: 'Aware', behaviours: null }, { level: 2, label: 'Applies', behaviours: null }], roles: [], usedIn: [], skillsTest: null, version: 4 };

describe('PRF-14 import and the skills test', () => {
  it('a refused import lists the rows from the API; nothing else changes', async () => {
    serve({
      'GET /performance/competencies': [COMP],
      'GET /org/masters/designations': [],
      'POST /performance/competencies/import': () => {
        throw Object.assign(new Error('1 row has a problem. Nothing was imported. Fix the file and import it again.'), { status: 400, body: { problems: [{ line: 2, name: 'X', problems: ['Give a name of 2 to 120 characters.'] }] } });
      },
    }, ['perf.setup.manage', 'org.structure.view']);
    wrap(<YxCompetenciesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
    const d = screen.getByRole('dialog');
    await userEvent.upload(d.querySelector('input[type="file"]') as HTMLInputElement, new File(['name,group,levels\nX,core,A1|B1'], 'c.csv', { type: 'text/csv' }));
    expect(await within(d).findByText('Give a name of 2 to 120 characters.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ csv: 'name,group,levels\nX,core,A1|B1' });
  });

  it('the skills test saves the chosen tag with the version', async () => {
    serve({
      'GET /performance/competencies': [COMP],
      'GET /org/masters/designations': [],
      'GET /performance/competencies/question-tags': [{ value: 't1', label: 'Food safety', questions: 3 }],
      'PUT /performance/competencies/k1': (b: unknown) => ({ ...COMP, ...(b as object), group: 'functional', levels: COMP.levels, skillsTest: { tagId: 't1', name: 'Food safety', questions: 3 } }),
    }, ['perf.setup.manage', 'org.structure.view']);
    wrap(<YxCompetenciesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a question tag' }));
    const d = screen.getByRole('dialog');
    await userEvent.click(await within(d).findByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Food safety (3 questions)' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Save skills test' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual(expect.objectContaining({ questionTagId: 't1', version: 4 })));
  });
});

describe('PRF-06 download', () => {
  it('the acknowledged review downloads as a PDF from the review route', async () => {
    const acknowledged = {
      id: 'x1', cycle: { id: 'c1', name: 'FY annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', stages: [{ key: 'manager', dueOn: '2026-11-20' }] }, employee: 'Arjun', employeeId: 'e1', manager: 'Priya', role: 'employee', status: 'acknowledged',
      next: { stage: 'done', label: 'Acknowledged', owner: 'Arjun', dueOn: null }, template: { name: 'Annual', scoring: 'weighted', levels: [{ value: 4, label: 'Exceeds' }], sections: [] }, goals: [], self: null, selfSubmitted: false,
      managerEntry: { status: 'submitted', answers: {}, overallRating: null, comment: 'Strong year.', submittedAt: null, version: 1 }, finalScore: 4, band: 'Exceeds', excludedSections: [], sectionScores: [], trail: [],
      released: { at: '2026-11-20T09:00:00.000Z', acknowledgedAt: '2026-11-21T09:00:00.000Z', acknowledgeComment: null, disagreeBy: '2026-12-05' }, disagreements: [], can: { self: false, manager: false, acknowledge: false, disagree: false }, version: 3,
    };
    serve({ 'GET /performance/reviews/x1': acknowledged, 'GET /performance/reviews/x1/nominations': { peer: null, nominations: [], can: { propose: false, decide: false, add: false } } });
    (apiFetchBlob as jest.Mock).mockResolvedValue({ blob: new Blob(['%PDF-']), filename: 'review.pdf' });
    window.URL.createObjectURL = jest.fn(() => 'blob:x');
    window.URL.revokeObjectURL = jest.fn();
    wrap(<YxReviewPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download review' }));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalledWith('/performance/reviews/x1/pdf', {}, 'tok'));
  });
});

describe('PRF-12 extend after "not met"', () => {
  it('HR extends once more with a reason and the version', async () => {
    const pip = {
      id: 'x1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', reason: 'Accuracy fell.', expectations: 'Errors at most 2%.', support: 'Coaching.',
      startsOn: '2026-09-01', plannedEndsOn: '2026-10-01', endsOn: '2026-10-01', pausedDays: 0, pausedNow: false, checkinEveryDays: 7, status: 'not_met',
      acknowledgedAt: '2026-09-02T05:00:00.000Z', employeeComment: null, extendedFrom: null, extendReason: null, reextendedFrom: null, reextendReason: null, outcomeNote: 'Two goals missed.', outcomeAt: '2026-10-02T05:00:00.000Z', letterId: null, exitCaseId: null,
      goals: [], checkins: [], warning: false, role: 'hr', can: { acknowledge: false, checkin: false, employeeNote: false, outcome: false, extend: false, letter: false, startExit: true, extendAgain: true }, version: 5,
      approval: { steps: [], canDecide: false }, extendDays: 30, extendAgainDays: 15,
    };
    serve({ 'GET /performance/pips/x1': pip, 'POST /performance/pips/x1/extend-again': { ...pip, status: 'extended' } });
    wrap(<YxPipPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Outcome' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Extend plan' }));
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox'), 'Close to the target; one final push.');
    await userEvent.click(within(d).getByRole('button', { name: 'Extend by 15 days' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/performance/pips/x1/extend-again', body: { reason: 'Close to the target; one final push.', version: 5 } }));
  });
});
