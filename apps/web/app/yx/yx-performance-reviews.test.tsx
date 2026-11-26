import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxReviewCyclePage from './(app)/performance/cycles/[id]/page';
import YxReviewPage from './(app)/performance/reviews/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// PRF-04 control room, PRF-05 review workspace and PRF-06 acknowledgement wired to /performance (performance builder 1).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/cycles/c1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const CYCLE = { id: 'c1', name: 'FY annual', kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: 't1', scaleId: 's1', population: null, stages: [{ key: 'self', dueOn: '2026-11-10' }, { key: 'manager', dueOn: '2026-11-20' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, status: 'launched', launchedAt: '2026-11-01T09:00:00.000Z', version: 2 };
const REVIEW = { id: 'r1', cycle: { id: 'c1', name: 'FY annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', stages: [{ key: 'self', dueOn: '2026-11-10' }, { key: 'manager', dueOn: '2026-11-20' }] }, employee: 'Arjun', employeeId: 'e1', manager: 'Priya', role: 'employee', status: 'open', next: { stage: 'self', label: 'Self review', owner: 'Arjun', dueOn: '2026-11-10' }, template: { name: 'Annual', scoring: 'weighted', levels: [{ value: 3, label: 'Meets' }, { value: 4, label: 'Exceeds' }], sections: [{ id: 'g', kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self', 'manager'], questions: [{ id: 'g', text: 'Goals', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }] }, goals: [], self: null, selfSubmitted: false, managerEntry: null, finalScore: null, band: null, excludedSections: [], trail: [], can: { self: true, manager: false }, version: 1 };

describe('PRF-04 … 06 live (performance builder 1)', () => {
  it('the control room shows the names behind a stage and reminds overdue owners', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': ['perf.cycle.manage'],
      'GET /performance/cycles/c1': CYCLE,
      'GET /performance/cycles/c1/funnel': [{ stage: 'self', label: 'Self review', count: 2 }, { stage: 'manager', label: 'Manager review', count: 1 }],
      'GET /performance/cycles/c1/overdue': [{ ownerEmployeeId: 'e1', owner: 'Arjun Rao', stage: 'Self review', count: 1 }],
      'GET /performance/cycles/c1/eligibility': [],
      'GET /performance/cycles/c1/disagreements': [],
      'GET /performance/cycles/c1/calibrations': { bands: [], sessions: [] },
      'GET /performance/calibration-facilitators': [],
      'GET /org/masters/departments': [],
      'GET /performance/cycles/c1/funnel/people': [{ reviewId: 'r1', employee: 'Arjun Rao', owner: 'Arjun Rao', dueOn: '2026-11-10', overdue: true }],
      'POST /performance/cycles/c1/remind': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { reminded: 1 }),
    });
    wrap(<YxReviewCyclePage />);
    await userEvent.click(await screen.findByRole('link', { name: 'Self review' }));
    expect(await within(await screen.findByRole('dialog')).findByText('Arjun Rao')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Remind all overdue owners' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send reminders' }));
    await waitFor(() => expect(posted).toEqual([{ overdueOnly: true }]));
  });

  it('answer 2845: a new calibration session starts from the company guide the API sends; without one it starts with none', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const base = {
      'GET /rbac/me/permissions': ['perf.cycle.manage'],
      'GET /performance/cycles/c1': CYCLE,
      'GET /performance/cycles/c1/funnel': [],
      'GET /performance/cycles/c1/overdue': [],
      'GET /performance/cycles/c1/eligibility': [],
      'GET /performance/cycles/c1/disagreements': [],
      'GET /performance/calibration-facilitators': [],
      'GET /org/masters/departments': [],
    };
    route({ ...base, 'GET /performance/cycles/c1/calibrations': { bands: ['Meets', 'Exceeds'], sessions: [], defaultGuide: { bands: [{ label: 'Meets', share: 80 }, { label: 'Exceeds', share: 20 }], tolerance: 5 } } });
    const first = wrap(<YxReviewCyclePage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Calibration' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open a session' }));
    let d = screen.getByRole('dialog');
    expect(within(d).getByRole('radio', { name: 'Use a guide' })).toBeChecked();
    expect(within(d).getByRole('textbox', { name: /^Meets/ })).toHaveValue('80');
    expect(within(d).getByText(/Filled from the company guide/)).toBeInTheDocument();
    first.unmount();
    // Negative: the company guide is off (or names other ratings), so the API sends none and nothing is filled.
    route({ ...base, 'GET /performance/cycles/c1/calibrations': { bands: ['Meets', 'Exceeds'], sessions: [], defaultGuide: null } });
    wrap(<YxReviewCyclePage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Calibration' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open a session' }));
    d = screen.getByRole('dialog');
    expect(within(d).getByRole('radio', { name: 'None' })).toBeChecked();
    expect(within(d).queryByText(/Filled from the company guide/)).toBeNull();
  });

  it('a self review saves its draft to the self entry', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
    const put: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/reviews/r1': REVIEW,
      'GET /performance/reviews/r1/nominations': { peer: null, nominations: [], can: { propose: false, decide: false, add: false } },
      'PUT /performance/reviews/r1/entries/self': (_p: string, init: RequestInit) => (put.push(JSON.parse(String(init.body))), REVIEW),
    });
    wrap(<YxReviewPage />);
    await userEvent.click(await screen.findByRole('radio', { name: '4 · Exceeds' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(put).toEqual([{ answers: [{ questionId: 'g', rating: 4, text: null }], overallRating: null, comment: null }]));
  });

  it('after release the employee acknowledges with a disagreement in one step; a short reason is refused', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
    const posted: unknown[] = [];
    const released = { ...REVIEW, status: 'released', next: { stage: 'done', label: 'Released', owner: 'Arjun', dueOn: null }, finalScore: 4, band: 'Exceeds', sectionScores: [{ title: 'Goals', score: 4 }], managerEntry: { status: 'submitted', answers: {}, overallRating: null, comment: 'Strong year.', submittedAt: null, version: 1 }, released: { at: '2026-11-20T09:00:00.000Z', acknowledgedAt: null, acknowledgeComment: null, disagreeBy: '2026-12-05' }, disagreements: [], can: { self: false, manager: false, acknowledge: true, disagree: true }, version: 3 };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/reviews/r1': released,
      'GET /performance/reviews/r1/nominations': { peer: null, nominations: [], can: { propose: false, decide: false, add: false } },
      'POST /performance/reviews/r1/acknowledge': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), released),
    });
    wrap(<YxReviewPage />);
    expect(await screen.findByText('Strong year.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /I disagree with this rating/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /What do you disagree with/ }), 'Too short');
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge and send disagreement' }));
    expect(screen.getByText(/at least 20 characters/)).toBeInTheDocument();
    expect(posted).toEqual([]);
    await userEvent.type(screen.getByRole('textbox', { name: /What do you disagree with/ }), ' and it misses the vendor delay.');
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge and send disagreement' }));
    await waitFor(() => expect(posted).toEqual([{ comment: null, disagreement: 'Too short and it misses the vendor delay.' }]));
    expect(await screen.findByText('Review acknowledged')).toBeInTheDocument();
  });
});
