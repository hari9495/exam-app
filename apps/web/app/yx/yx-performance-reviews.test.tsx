import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxReviewCyclePage from './(app)/performance/cycles/[id]/page';
import YxReviewPage from './(app)/performance/reviews/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Review cycles and reviews wired to /performance (M06 batch PM4, PM-4.08).
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
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/cycles/c1');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const CYCLE = { id: 'c1', name: 'FY annual', kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: 't1', scaleId: 's1', population: null, stages: [{ key: 'manager', dueOn: '2026-10-31' }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, status: 'draft', launchedAt: null, version: 2 };

describe('Review cycles and reviews (M06 batch PM4)', () => {
  it('the check runs, then the cycle starts with its version', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });
    const launched: unknown[] = [];
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/cycles/c1': CYCLE,
      'GET /performance/cycle-templates': [],
      'GET /org/masters/departments': [],
      'POST /performance/cycles/c1/preflight': { problems: [], reviewed: 3, excluded: 1, protectedLeave: 1, leavers: 0 },
      'POST /performance/cycles/c1/launch': (_p: string, init: RequestInit) => (launched.push(JSON.parse(String(init.body))), { reviews: 3 }),
    });
    wrap(<YxReviewCyclePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Run the check' }));
    expect(await screen.findByText(/3 people reviewed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start the cycle' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(launched).toEqual([{ version: 2 }]));
  });

  it('a self review saves its draft to the self entry', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
    const put: unknown[] = [];
    const review = { id: 'r1', cycle: { id: 'c1', name: 'FY annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', stages: [] }, employee: 'Arjun', employeeId: 'e1', manager: 'Priya', role: 'employee', status: 'open', next: { stage: 'self', label: 'Self review', owner: 'Arjun', dueOn: null }, template: { name: 'Annual', scoring: 'weighted', levels: [{ value: 3, label: 'Meets' }], sections: [{ id: 'g', kind: 'goals', title: 'Goals', weight: 100, rated: true, whoAnswers: ['self'], questions: [{ id: 'g', text: 'Goals', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }] }, goals: [], self: null, selfSubmitted: false, managerEntry: null, finalScore: null, band: null, excludedSections: [], trail: [], can: { self: true, manager: false }, version: 1 };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/reviews/r1': review,
      'PUT /performance/reviews/r1/entries/self': (_p: string, init: RequestInit) => (put.push(JSON.parse(String(init.body))), review),
    });
    wrap(<YxReviewPage />);
    await userEvent.click(await screen.findByRole('radio', { name: '3 · Meets' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(put).toEqual([{ answers: [{ questionId: 'g', rating: 3, text: null }], overallRating: null }]));
  });
});
